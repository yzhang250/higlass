import { scaleLinear, scaleBand } from 'd3-scale';
import { range } from 'd3-array';
import * as PIXI from 'pixi.js';

import Tiled1DPixiTrack from './Tiled1DPixiTrack';
import { trackUtils } from './utils';

import FS from './PileupTrack.fs';
import VS from './PileupTrack.vs';

const COLORS = [
  [0, 0, 0, 0.25], // base
  [0, 0, 1, 1], // A
  [1, 0, 0, 1], // C
  [0, 1, 0, 1], // G
  [1, 1, 0, 1], // T
  [0, 1, 1, 0.75], // S
];

const createColorTexture = (colors = COLORS) => {
  const colorTexRes = Math.max(2, Math.ceil(Math.sqrt(colors.length)));
  const rgba = new Float32Array(colorTexRes ** 2 * 4);
  colors.forEach((color, i) => {
    rgba[i * 4] = color[0]; // r
    rgba[i * 4 + 1] = color[1]; // g
    rgba[i * 4 + 2] = color[2]; // b
    rgba[i * 4 + 3] = color[3]; // a
  });

  return [
    PIXI.Texture.fromBuffer(
      rgba,
      colorTexRes,
      colorTexRes,
    ),
    colorTexRes
  ];
};

const [COLOR_TEX, COLOR_TEX_RES] = createColorTexture();

const uniforms = new PIXI.UniformGroup({
  uColorTex: COLOR_TEX,
  uColorTexRes: COLOR_TEX_RES,
});

const shader = PIXI.Shader.from(VS, FS, uniforms);

const scaleScalableGraphics = (graphics, xScale, drawnAtScale) => {
  const [atScaleStart, atScaleEnd] = drawnAtScale.domain();
  const [xScaleStart, xScaleEnd] = xScale.domain();
  const tileK = (atScaleEnd - atScaleStart) / (xScaleEnd - xScaleStart);
  const newRange = xScale.domain().map(drawnAtScale);

  const posOffset = newRange[0];
  graphics.scale.x = tileK;
  graphics.position.x = -posOffset * tileK;
};

class PileupTrack extends Tiled1DPixiTrack {
  constructor(context, options) {
    super(context, options);

    this.worker = this.dataFetcher.worker;

    // we scale the entire view up until a certain point
    // at which point we redraw everything to get rid of
    // artifacts
    // this.drawnAtScale keeps track of the scale at which
    // we last rendered everything
    this.drawnAtScale = scaleLinear();
    this.prevRows = [];

    // graphics for highliting reads under the cursor
    this.mouseOverGraphics = new PIXI.Graphics();
  }

  rerender(newOptions) {
    this.updateExistingGraphics();
  }

  updateExistingGraphics() {
    // for (const tile of Object.values(this.fetchedTiles)) {
    //   // console.log('ueg tile:', tile);
    //   for (const segment of tile.tileData) {
    //     allSegments[segment.id] = segment;
    //   }
    // }

    this.worker.then((tileFunctions) => {
      tileFunctions.renderSegments(
        this.dataFetcher.uid,
        Object.keys(this.fetchedTiles),
        this._xScale.domain(),
        this._xScale.range(),
        this.position,
        this.dimensions,
        this.prevRows
      ).then(({
        rows,
        positionsBuffer,
        colorsBuffer,
        xScaleDomain,
        xScaleRange,
      }) => {
        const t1 = performance.now();

        const newGraphics = new PIXI.Graphics();

        const positions = new Float32Array(positionsBuffer);
        const colors = new Float32Array(colorsBuffer);

        this.prevRows = rows;

        const geometry = new PIXI.Geometry();
        geometry.addAttribute('aPosition', positions, 2); // x,y
        geometry.addAttribute('aColorCode', colors);

        const state = new PIXI.State();
        const mesh = new PIXI.Mesh(geometry, shader, state);

        newGraphics.addChild(mesh);
        this.pMain.x = this.position[0];


        if (this.segmentGraphics) {
          this.pMain.removeChild(this.segmentGraphics);
        }

        this.pMain.addChild(newGraphics);
        this.segmentGraphics = newGraphics;

        this.yScaleBand = scaleBand()
          .domain(range(0, this.prevRows.length))
          .range([this.position[1], this.position[1] + this.dimensions[1]])
          .paddingInner(0.2);
        this.drawnAtScale = scaleLinear()
          .domain(xScaleDomain)
          .range(xScaleRange);

        scaleScalableGraphics(
          this.segmentGraphics,
          this._xScale,
          this.drawnAtScale,
        );

        this.draw();
        this.animate();
        // eslint-disable-next-line
        console.log(`Sync work took ${performance.now() - t1} msec`);
      });
    });
  }

  draw() {
    const valueScale = scaleLinear()
      .domain([0, this.prevRows.length])
      .range([0, this.dimensions[1]]);
    trackUtils.drawAxis(this, valueScale);
  }

  getMouseOverHtml(trackX, trackY) {
    if (this.yScaleBand) {
      const eachBand = this.yScaleBand.step();
      const index = Math.round((trackY / eachBand));


      if (index >= 0 && index < this.prevRows.length) {
        const row = this.prevRows[index];

        for (const read of row) {
          const readTrackFrom = this._xScale(read.from);
          const readTrackTo = this._xScale(read.to);

          if (readTrackFrom <= trackX && trackX <= readTrackTo) {
            return (`Read length: ${read.to - read.from}<br>`
              + `CIGAR: ${read.cigar || ''} MD: ${read.md || ''}`);
          }
        }
      }
      // var val = self.yScale.domain()[index];
    }
    return null;
  }

  calculateZoomLevel() {
    return trackUtils.calculate1DZoomLevel(
      this.tilesetInfo,
      this._xScale,
      this.maxZoom
    );
  }

  calculateVisibleTiles() {
    const tiles = trackUtils.calculate1DVisibleTiles(
      this.tilesetInfo,
      this._xScale
    );

    this.setVisibleTiles(tiles);
  }

  zoomed(newXScale, newYScale) {
    super.zoomed(newXScale, newYScale);

    if (this.segmentGraphics) {
      scaleScalableGraphics(this.segmentGraphics, newXScale, this.drawnAtScale);
    }
  }
}

export default PileupTrack;
