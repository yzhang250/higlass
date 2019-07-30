import { scaleBand, scaleLinear } from 'd3-scale';
import { range } from 'd3-array';
import * as PIXI from 'pixi.js';
import { spawn, Thread, Worker } from 'threads';
import Tiled1DPixiTrack from './Tiled1DPixiTrack';
import { trackUtils, segmentsToRows, parseMD } from './utils';


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

    console.log('worker', Worker);
    this.drawSegments = spawn(
      new Worker('./workers/PileupTrackWorker')
    );
    console.log('drawSegments', this.drawSegments);
    // we scale the entire view up until a certain point
    // at which point we redraw everything to get rid of
    // artifacts
    // this.drawnAtScale keeps track of the scale at which
    // we last rendered everything
    this.drawnAtScale = scaleLinear();
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

    const newGraphics = new PIXI.Graphics();

    console.log('this.dimensions:', this.dimensions);
    // drawSegments(
    //   Object.values(allSegments),
    //   newGraphics,
    //   this._xScale,
    //   this.position,
    //   this.dimensions,
    // );
    this.drawSegments.then((drawSegments) => {
      console.log('drawSegments', drawSegments);
      drawSegments(
        Object.values(allSegments),
        newGraphics,
        this._xScale,
        this.position,
        this.dimensions
      );
    });

    if (this.segmentGraphics) {
      this.pMain.removeChild(this.segmentGraphics);
    }

    this.pMain.addChild(newGraphics);
    this.segmentGraphics = newGraphics;

    this.drawnAtScale = this._xScale.copy();
    // console.log('ueg', allSegments);
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
