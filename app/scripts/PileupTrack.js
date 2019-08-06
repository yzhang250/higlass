import { scaleLinear, scaleBand } from 'd3-scale';
import { range } from 'd3-array';
import * as PIXI from 'pixi.js';
import { spawn, Thread, Worker } from 'threads';
import Tiled1DPixiTrack from './Tiled1DPixiTrack';
import { trackUtils } from './utils';

function currTime() {
  const d = new Date();
  return d.getTime();
}

const shader = PIXI.Shader.from(`

    attribute vec2 position;
    attribute vec4 aColor;

    uniform mat3 projectionMatrix;
    uniform mat3 translationMatrix;

    varying vec4 vColor;
    
    void main(void)
    {
        vColor = aColor;
        gl_Position = vec4((projectionMatrix * translationMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
    }

`,
`  
varying vec4 vColor;

    void main(void) {
        gl_FragColor = vColor;
    }
`);

const scaleScalableGraphics = (graphics, xScale, drawnAtScale) => {
  const tileK = (drawnAtScale.domain()[1] - drawnAtScale.domain()[0])
    / (xScale.domain()[1] - xScale.domain()[0]);
  const newRange = xScale.domain().map(drawnAtScale);

  const posOffset = newRange[0];
  graphics.scale.x = tileK;
  graphics.position.x = -posOffset * tileK;
};

class PileupTrack extends Tiled1DPixiTrack {
  constructor(context, options) {
    super(context, options);

    this.renderSegments = spawn(
      new Worker('./workers/PileupTrackWorker')
    );
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
    const allSegments = {};

    for (const tile of Object.values(this.fetchedTiles)) {
      // console.log('ueg tile:', tile);
      for (const segment of tile.tileData) {
        allSegments[segment.id] = segment;
      }
    }


    this.renderSegments.then((renderSegments) => {
      const renderedSegments = renderSegments(
        Object.values(allSegments),
        this._xScale.domain(),
        this._xScale.range(),
        this.position,
        this.dimensions,
        this.prevRows
      ).then((toRender) => {
        // console.log('toRender', toRender);
        const t1 = currTime();

        const positions = new Float32Array(toRender.positionsBuffer);
        const colors = new Float32Array(toRender.colorsBuffer);

        // console.log('positions', positions);
        // console.log('colors:', colors);

        const newGraphics = new PIXI.Graphics();

        this.prevRows = toRender.rows;

        const geometry = new PIXI.Geometry()
          .addAttribute('position', positions, 2);// x,y
        geometry.addAttribute('aColor', colors, 4);

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
          .domain(toRender.xScaleDomain)
          .range(toRender.xScaleRange);

        scaleScalableGraphics(
          this.segmentGraphics,
          this._xScale,
          this.drawnAtScale,
        );

        this.draw();
        this.animate();
        const t2 = currTime();
        console.log('renderSegments 1', t2 - t1);
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
