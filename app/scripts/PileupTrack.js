import { scaleBand, scaleLinear } from 'd3-scale';
import { range } from 'd3-array';
import * as PIXI from 'pixi.js';
import Tiled1DPixiTrack from './Tiled1DPixiTrack';
import { trackUtils, segmentsToRows, parseMD } from './utils';


function currTime() {
  const d = new Date();
  return d.getTime();
}

const baseColors = {
  A: 0x0000ff,
  C: 0xff0000,
  G: 0x00ff00,
  T: 0xffff00,
};

const drawSegments = (segmentList, graphics, xScale, position, dimensions) => {
  const t1 = currTime();

  console.log('segmentList', segmentList.slice(0, 20));

  const numSegments = segmentList.length;
  const rows = segmentsToRows(segmentList);
  const d = range(0, rows.length);
  const r = [position[1], position[1] + dimensions[1]];
  const yScale = scaleBand().domain(d).range(r);

  let graphicsRects = 0;

  let currGraphics = new PIXI.Graphics();
  graphics.addChild(currGraphics);


  currGraphics.clear();
  currGraphics.lineStyle(1, 0x000000);

  // const array = Uint8Array.from([0xff, 0x00, 0x00, 0xff]);
  // console.log('array:', array);
  // var texture = PIXI.Texture.fromBuffer(
  // array, 1, 1);
  // const sprite = new PIXI.Sprite(texture);
  // console.log('sprite 1:', sprite);

  // sprite.width=300;
  // sprite.height=300;
  // g.addChild(sprite)

  let mds = 0;

  rows.map((row, i) => {
    row.map((segment, j) => {
      const from = xScale(segment.from);
      const to = xScale(segment.to);
      // console.log('from:', from, 'to:', to);
      // console.log('yScale(i)', yScale(i), yScale.bandwidth());

      currGraphics.beginFill(0xffffff);
      currGraphics.drawRect(
        from,
        yScale(i), to - from, yScale.bandwidth()
      );

      if (segment.md) {
        const substitutions = parseMD(segment.md);

        currGraphics.lineStyle(0, 0x000000);
        for (const substitution of substitutions) {
          // const sprite = new PIXI.Sprite(texture);
          // sprite.x = xScale(segment.from + substitution.pos - 1);
          // sprite.y = yScale(i);

          // sprite.width = Math.max(1, xScale(1) - xScale(0));
          // sprite.height = yScale.bandwidth();

          // g.addChild(sprite);
          mds += 1;
          currGraphics.beginFill(baseColors[substitution.base]);

          if (graphicsRects > 1000) {
            currGraphics = new PIXI.Graphics();
            graphics.addChild(currGraphics);
            graphicsRects = 0;
          }

          graphicsRects += 1;
          currGraphics.drawRect(
            xScale(segment.from + substitution.pos - 1),
            yScale(i),
            Math.max(1, xScale(1) - xScale(0)),
            yScale.bandwidth(),
          );
        }
        currGraphics.lineStyle(1, 0x000000);
      }

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
  console.log('mds:', mds);
  console.log('perSegment', 100 * (t2 - t1) / numSegments, 'drawSegments', t2 - t1, '# of segments:', numSegments);
};

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
  }
}

export default PileupTrack;
