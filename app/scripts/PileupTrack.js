import { scaleBand, scaleLinear } from 'd3-scale';
import { range } from 'd3-array';
import * as PIXI from 'pixi.js';
import Tiled1DPixiTrack from './Tiled1DPixiTrack';
import { trackUtils, segmentsToRows } from './utils';


function currTime() {
  const d = new Date();
  return d.getTime();
}

const drawSegments = (segmentList, graphics, xScale, position, dimensions) => {
  const t1 = currTime();

  const numSegments = segmentList.length;
  const rows = segmentsToRows(segmentList);
  const d = range(0, rows.length);
  const r = [position[1], position[1] + dimensions[1]];
  const yScale = scaleBand().domain(d).range(r);

  const g = graphics;

  g.clear();
  g.lineStyle(1, 0x000000);

  rows.map((row, i) => {
    row.map((segment, j) => {
      const from = xScale(segment.from);
      const to = xScale(segment.to);

      // console.log('from:', from, 'to:', to);
      // console.log('yScale(i)', yScale(i), yScale.bandwidth());

      g.beginFill(0xffffff);
      g.drawRect(
        from,
        yScale(i), to - from, yScale.bandwidth()
      );

      // if (segment.differences) {
      //   for (const diff of segment.differences) {
      //     g.beginFill(0xff00ff);
      //     const start = this._xScale(segment.from + diff[0]);
      //     const end = this._xScale(segment.from + diff[0] + 1);

      //     console.log('drawing rect', start, yScale(i), end - start, yScale.bandwidth());
      //     g.drawRect(
      //       start,
      //       yScale(i), end - start, yScale.bandwidth()
      //     );
      //   }
      // }
    });
  });
  const t2 = currTime();
  console.log('drawSegments', t2 - t1, '# of segments:', numSegments);
};

const scaleScalableGraphics = (graphics, xScale, drawnAtScale) => {
  const tileK = (drawnAtScale.domain()[1] - drawnAtScale.domain()[0])
    / (xScale.domain()[1] - xScale.domain()[0]);
  const newRange = xScale.domain().map(drawnAtScale);

  const posOffset = newRange[0];
  graphics.scale.x = tileK;
  graphics.position.x = -posOffset * tileK;
};

const scaleScalable = (tiles, xScale, graphicsAccessorIn) => {
  let graphicsAccessor = graphicsAccessorIn;

  if (graphicsAccessor === undefined) {
    graphicsAccessor = tile => tile.graphics;
  }

  for (const tile of tiles) {
    if (tile.drawnAtScale) {
      const graphics = graphicsAccessor(tile);
      const tileK = (tile.drawnAtScale.domain()[1] - tile.drawnAtScale.domain()[0])
        / (xScale.domain()[1] - xScale.domain()[0]);
      const newRange = xScale.domain().map(tile.drawnAtScale);

      const posOffset = newRange[0];
      graphics.scale.x = tileK;
      graphics.position.x = -posOffset * tileK;
    }
  }
};

class PileupTrack extends Tiled1DPixiTrack {
  constructor(context, options) {
    super(context, options);

    // we scale the entire view up until a certain point
    // at which point we redraw everything to get rid of
    // artifacts
    // this.drawnAtScale keeps track of the scale at which
    // we last rendered everything
    this.drawnAtScale = scaleLinear();
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

    drawSegments(
      Object.values(allSegments),
      newGraphics,
      this._xScale,
      this.position,
      this.dimensions,
    );

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
    // scaleScalable(Object.values(this.fetchedTiles), newXScale);
  }
}

export default PileupTrack;
