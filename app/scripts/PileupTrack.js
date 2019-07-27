import { scaleBand } from 'd3-scale';
import { range } from 'd3-array';
import Tiled1DPixiTrack from './Tiled1DPixiTrack';
import { trackUtils, segmentsToRows } from './utils';


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
    console.log('dataFetcher:', context.dataFetcher);
    console.log('hi there');
  }

  draw() {
    console.log('draw', this.fetchedTiles);
  }

  initTile(tile) {
    console.log('tile:', tile);
    const rows = segmentsToRows(tile.tileData);
    const d = range(0, rows.length);
    const r = [this.position[1], this.position[1] + this.dimensions[1]];
    const yScale = scaleBand().domain(d).range(r);

    const g = tile.graphics;

    g.clear();
    g.lineStyle(1, 0x000000);

    tile.drawnAtScale = this._xScale.copy();

    rows.map((row, i) => {
      row.map((segment, j) => {
        const from = this._xScale(segment.from);
        const to = this._xScale(segment.to);

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
    // console.log('rows:', rows);
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

    scaleScalable(Object.values(this.fetchedTiles), newXScale);
  }
}

export default PileupTrack;
