import { scaleLinear } from 'd3-scale';
import * as PIXI from 'pixi.js';
import { spawn, Thread, Worker } from 'threads';
import Tiled1DPixiTrack from './Tiled1DPixiTrack';
import { trackUtils } from './utils';

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
        const newGraphics = new PIXI.Graphics();

        this.prevRows = toRender.rows;

        const geometry = new PIXI.Geometry()
          .addAttribute('position', toRender.positions, 2);// x,y
        geometry.addAttribute('aColor', toRender.colors, 4);

        const state = new PIXI.State();
        const mesh = new PIXI.Mesh(geometry, shader, state);

        newGraphics.addChild(mesh);
        this.pMain.x = this.position[0];

        if (this.segmentGraphics) {
          this.pMain.removeChild(this.segmentGraphics);
        }

        this.pMain.addChild(newGraphics);
        this.segmentGraphics = newGraphics;

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
      });
    });
  }

  draw() {
    const valueScale = scaleLinear()
      .domain([0, this.prevRows.length])
      .range([0, this.dimensions[1]]);
    trackUtils.drawAxis(this, valueScale);
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
