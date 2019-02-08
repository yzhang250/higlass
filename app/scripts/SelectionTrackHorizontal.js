import { brush } from 'd3-brush';
import { event } from 'd3-selection';
import slugid from 'slugid';
import createPubSub from 'pub-sub-es';
import { tileProxy } from './services';

import SVGTrack from './SVGTrack';
import TileManager from './TileManager';

const ANNOS_SERVER = 'http://localhost:8000/api/v0';

const TILESET_INFO = {
  min_pos: [0],
  max_pos: [Math.floor(1e12)],
  tile_size: 256,
};

TILESET_INFO.max_zoom = Math.ceil(
  Math.log(TILESET_INFO.max_pos
    / TILESET_INFO.tile_size) / Math.log(2)
);


/**
 * Convert a tileId consisting of a number
 *
 * @param  {string} tileId Tile id that consists of z.x
 * @return {[int,int]}     The start and end positions of
 *                             the interval
 */
function tileIdToRange(tileId) {
  const idParts = tileId.split('.');

  const zoomLevel = +idParts[0];
  const xPos = +idParts[1];

  const tileWidth = TILESET_INFO.max_pos[0] / 2 ** zoomLevel;

  const xStart = TILESET_INFO.min_pos[0] + tileWidth * xPos;
  const xEnd = xStart + tileWidth;

  return [xStart, xEnd];
}
/**
 * A fetcher for annotations.
 */
class AnnotationDataFetcher {
  constructor(sourceAPI) {
    this.sourceAPI = sourceAPI;
  }

  fetchTilesDebounced(
    onTilesReceived,
    toFetchList,
  ) {
    const rangeToTileId = {};
    const queryString = toFetchList.map((x) => {
      const range = tileIdToRange(x);
      rangeToTileId[range] = x;
      return `r=${range[0]},${range[1]}`;
    }).join('&');

    fetch(`${ANNOS_SERVER}/annos-1d/?${queryString}`,
      {
        method: 'GET',
      })
      .then(ret => ret.json())
      .then((json) => {
        const byTileId = Object.entries(json)
          .map(x => [rangeToTileId[x[0]], x[1]])
          .reduce((accum, [k, v]) => {
            accum[k] = v;
            return accum;
          }, {});

        console.log('byTileId', byTileId);
        onTilesReceived(byTileId);
      });
  }
}

class SelectionTrackHorizontal extends SVGTrack {
  constructor(context, options) {
    // create a clipped SVG Path
    super(context, options);
    const {
      registerSelectionChanged,
      removeSelectionChanged,
      setDomainsCallback,
    } = context;

    const uid = slugid.nice();
    this.uid = uid;
    this.context = context;
    this.options = options;
    this.newSelection = false;
    this.localPubSub = createPubSub();
    this.loadedTiles = {};

    this.dataFetcher = new AnnotationDataFetcher(
      'http://localhost:8000/api/v0'
    );
    this.tileManager = new TileManager(
      this,
      this.dataFetcher,
    );

    this.context.pubSub.subscribe(
      'app.mouseClick', () => {
        // console.log('mouseClick');
        this.disableBrush();
      }
    );

    this.context.pubSub.subscribe(
      'app.selectionStarted', () => {
        this.disableBrush();
        this.newSelection = true;
        this.enableBrush();
      }
    );

    this.context.pubSub.subscribe(
      'app.selectionEnded', () => {
        this.newSelection = false;
        this.disableBrush();
      }
    );

    this.removeSelectionChanged = removeSelectionChanged;
    this.setDomainsCallback = setDomainsCallback;

    this.selectionXDomain = null;
    this.selectionYDomain = null;

    if (context.xDomain) {
      // track has an x-domain set
      this.selectionXDomain = context.xDomain;
    }

    this.brush = brush(true)
      .on('brush', this.brushed.bind(this))
      .on('end', this.brushEnded.bind(this));

    this.gBrush = null;
    this.selected = null;

    // the selection will call this.selectionChanged immediately upon
    // hearing registerSelectionChanged
    this.draw();

    this.prevZoomLevel = 0;

    registerSelectionChanged(uid, this.selectionChanged.bind(this));
  }

  /**
   * Enable the brush. If a parameter is passed, create
   * the brush on top of that rectangle.
   *
   * @param  {int} onRect The index of the rectangle on which to
   *                      center the brush.
   * @return {null}       Nothing.
   */
  enableBrush(onRect) {
    this.gBrush = this.gMain
      .append('g')
      .attr('id', `brush-${this.uid}`);

    this.gBrush.call(this.brush);

    // turn off the ability to select new regions for this brush
    this.gBrush.selectAll('.overlay')
      .style('pointer-events', 'all');

    // turn off the ability to modify the aspect ratio of the brush
    this.gBrush.selectAll('.handle--ne')
      .style('pointer-events', 'none');

    this.gBrush.selectAll('.handle--nw')
      .style('pointer-events', 'none');

    this.gBrush.selectAll('.handle--sw')
      .style('pointer-events', 'none');

    this.gBrush.selectAll('.handle--se')
      .style('pointer-events', 'none');

    this.gBrush.selectAll('.handle--n')
      .style('pointer-events', 'none');

    this.gBrush.selectAll('.handle--s')
      .style('pointer-events', 'none');

    if (onRect !== null && onRect !== undefined) {
      // console.log('enabling', onRect);
      // we've clicked on an existing selection so don't
      // allow selecting regions outside of it
      this.gBrush.selectAll('.overlay')
        .style('pointer-events', 'none');

      // console.log('savedRegions:', this.options.savedRegions)
      this.selectionXDomain = [
        this.visibleAnnotations[onRect].x_start,
        this.visibleAnnotations[onRect].x_end,
      ];
      this.draw();
    }
  }

  disableBrush() {
    if (this.gBrush) {
      this.localPubSub.publish('track.regionUnselected');
      this.selected = null;
      this.selectionXDomain = null;
      this.gBrush.remove();
      this.draw();
    }
  }

  brushEnded() {
    if (event.selection === null) {
      this.setDomainsCallback(null, this.selectionYDomain);

      this.gBrush.selectAll('.overlay')
        .attr('cursor', 'move');
    }


    this.finishedEditing();
  }

  selectedRegion() {
    const selectedRegion = this.visibleAnnotations[this.selected];

    return selectedRegion;
  }

  newAnnotation() {
    const annoUid = slugid.nice();
    this.visibleAnnotations[annoUid] = {
      x_start: this.selectionXDomain[0],
      x_end: this.selectionXDomain[0],
      anno_uid: annoUid,
    };

    this.selected = annoUid;
  }

  updateSelectedAnnotation() {
    const selectedRegion = this.selectedRegion();
    selectedRegion.x_start = this.selectionXDomain[0];
    selectedRegion.x_end = this.selectionXDomain[1];
  }

  finishedEditing() {
    const selectedRegion = this.selectedRegion();

    this.localPubSub.publish('track.brushEnded',
      selectedRegion);
  }

  brushed() {
    /**
     * Should only be called  on active brushing, not in response to the
     * draw event
     */
    const s = event.selection;
    if (!this._xScale || !this._yScale) { return; }

    const xDomain = [this._xScale.invert(s[0][0]),
      this._xScale.invert(s[1][0])];

    const yDomain = this.selectionYDomain;

    this.selectionXDomain = xDomain;
    this.selectionYDomain = xDomain;
    // console.log('xDomain:', xDomain);
    // console.log('yDomain:', yDomain);
    if (this.selected !== null
      && this.selected !== undefined) {
      this.updateSelectedAnnotation();
    } else if (this.newSelection) {
      // Nothing is selected, so we've just started brushing
      // a new selection. Create a new section
      // console.log('adding:', this.selectionXDomain);
      this.newAnnotation();
    }

    this.setDomainsCallback(xDomain, yDomain);
    this.draw();
  }

  selectionChanged(selectionXDomain, selectionYDomain) {
    this.selectionXDomain = selectionXDomain;
    this.selectionYDomain = selectionYDomain;

    this.draw();
  }

  remove() {
    // remove the event handler that updates this selection tracker
    this.removeSelectionChanged(this.uid);

    super.remove();
  }

  rerender() {
    // set the fill and stroke colors
    if (this.gBrush) {
      this.gBrush.selectAll('.selection')
        .attr('fill', this.options.projectionFillColor)
        .attr('stroke', this.options.projectionStrokeColor)
        .attr('fill-opacity', this.options.projectionFillOpacity)
        .attr('stroke-opacity', this.options.projectionStrokeOpacity)
        .attr('stroke-width', this.options.strokeWidth);
    }
  }

  visibleAnnotations() {
    return this.tileManager
      .visibleAndFetchedTiles()
      .filter(x => x.tileData && x.tileData.results && x.tileData.results.length)
      .flatMap(x => x.tileData.results);
  }

  draw() {
    if (!this._xScale || !this.yScale) {
      return;
    }

    // console.log('this.tm.visibleAndFetchedTiles',
    //   this.visibleAnnotations());

    let dest = null;

    if (this.selectionXDomain) {
      const x0 = this._xScale(this.selectionXDomain[0]);
      const y0 = 0;

      const x1 = this._xScale(this.selectionXDomain[1]);
      const y1 = this.dimensions[1];

      dest = [[x0, y0], [x1, y1]];
    }

    const allRects = Object.values(this.visibleAnnotations);

    // const allRects = this.options.savedRegions;

    // console.log('this.visibleAndFetchedTiles',
    //   this.tileManager.visibleAndFetchedTiles());

    let rectSelection = this.gMain.selectAll('.region')
      .data(
        allRects
          .map((r, i) => [r, i]) // keep track of the index of each
        // rectangle so that we can use it to alter the selection later
          .filter(r => r.anno_uid !== this.selected),
        x => x[0].anno_uid
      );

    // previously drawn selections can be interacted with
    // necessary for enabling the click event below
    rectSelection
      .enter()
      .append('rect')
      .classed('region', true)
      .attr('fill', this.options.projectionFillColor)
      .attr('stroke', 'yellow')
      .attr('fill-opacity', this.options.projectionFillOpacity)
      .attr('stroke-opacity', this.options.projectionStrokeOpacity)
      .attr('stroke-width', this.options.strokeWidth)
      .style('pointer-events', 'all');

    rectSelection.exit()
      .remove();

    rectSelection = this.gMain.selectAll('.region')
      .attr('x', d => this._xScale(d[0].x_start))
      .attr('y', 0)
      .attr('width', d => this._xScale(d[0].x_end) - this._xScale(d[0].x_start))
      .attr('height', this.dimensions[1])
      .on('click', (d) => {
        this.disableBrush();
        this.selected = d[0].anno_uid;
        this.enableBrush(d[0].anno_uid);

        this.localPubSub.publish('track.regionSelected', d[0]);

        event.preventDefault();
        event.stopPropagation();
      });


    if (this.gBrush) {
      // user hasn't actively brushed so we don't want to emit a
      // 'brushed' event
      this.brush.on('brush', null);
      this.brush.on('end', null);
      // console.log('moving brush:', this.options.savedRegions);
      this.gBrush.call(this.brush.move, dest);
      this.brush.on('brush', this.brushed.bind(this));
      this.brush.on('end', this.brushEnded.bind(this));
    }
  }

  calculateVisibleTiles() {
    // if we don't know anything about this dataset, no point
    // in trying to get tiles
    // calculate the zoom level given the scales and the data bounds
    const maxInt = TILESET_INFO.max_pos[0];

    const zoomLevel = tileProxy.calculateZoomLevel(
      this._xScale, 0, maxInt, TILESET_INFO.tile_size
    );

    // x doesn't necessary mean 'x' axis, it just refers to the relevant axis
    // (x if horizontal, y if vertical)
    const xTiles = tileProxy.calculateTiles(
      zoomLevel, this._xScale,
      0,
      maxInt,
      Math.log(maxInt) / Math.log(2),
      maxInt
    );

    const tiles = xTiles.map(x => ({
      tileId: [zoomLevel, x].join('.'),
      tilePos: x,
      remoteId: [zoomLevel, x].join('.'),
    }));

    console.log('xScale', this._xScale.domain(), this._xScale.range());
    console.log('calculateTileAndPosInTile',
      tileProxy.calculateTileAndPosInTile(TILESET_INFO, maxInt,
        0, zoomLevel, this._xScale.domain()[0]));
    console.log('tiles:', tiles);
    return tiles;
  }

  calculateVisibleTileIds() {
    const tiles = this.calculateVisibleTiles();

    return new Set(tiles.map(t => t.tileId));
  }

  zoomed(newXScale, newYScale) {
    this.xScale(newXScale);
    this.yScale(newYScale);

    this.draw();
    // const zoomLevel = tileProxy.calculateZoomLevel(
    //   this._xScale, 0, Number.MAX_SAFE_INTEGER, 1
    // );

    // if (zoomLevel !== this.prevZoomLevel) {
    //   this.fetchAnnotations();
    //   this.prevZoomLevel = zoomLevel;
    //   console.log('zoomLevel', zoomLevel);
    // }

    this.tileManager.refreshTiles();
    // console.trace('zoomed');
  }

  /**
   * Check if this tile has already been loaded.
   * @param  {[type]} tileId [description]
   * @return {[type]}        [description]
   */
  tileLoaded(tileId) {
    return this.loadedTiles[tileId];
  }

  /**
   * Initialize a new tile.
   */
  initTile(tile) {
    // check if we have graphics for this tile,
    // if not, create them, otherwise do some
    // basic initialization
    console.log('tile:', tile, this.loadedTiles);
    for (const region of tile.tileData.results) {
      if (!this.visibleAnnotations[region.anno_uid]) {
        console.log('region:', region);
        this.visibleAnnotations[region.anno_uid] = region;
      }
    }
    return tile;
  }

  /**
   * Update a tile because new tiles have been
   * loaded. This may need to be called when a
   * scale is changed.
   *
   * @param  {Object} tile The tile to to update
   * @return {Nothing}      Nothing
   */
  updateTile(tile) {
    return tile;
  }

  zoomEnded() {
    // console.log('zoomEnded');
  }

  setPosition(newPosition) {
    super.setPosition(newPosition);

    this.draw();
  }
}

export default SelectionTrackHorizontal;
