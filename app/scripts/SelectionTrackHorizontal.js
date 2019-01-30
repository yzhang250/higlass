import { brush } from 'd3-brush';
import { event } from 'd3-selection';
import slugid from 'slugid';
import createPubSub from 'pub-sub-es';
import { tileProxy } from './services';

import SVGTrack from './SVGTrack';
import TileManager from './TileManager';

const ANNOS_SERVER = 'http://localhost:8000/api/v0/';

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
    this.tileManager = new TileManager(
      this
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
    this.fetchAnnotations();

    registerSelectionChanged(uid, this.selectionChanged.bind(this));
  }

  // syncAnnotations(newAnnotations) {
  //   const presentUids = new Set(this.options.savedRegions.map(x => x.uid));
  //   const newUids = new Set(newAnnotations.map(x => x.uid));

  //   const toRemove = [...presentUids].filter(x => !newUids.has);

  // }

  fetchAnnotations() {
    const url = `${ANNOS_SERVER}`
      + `annos-1d/?r=${Math.floor(this._xScale.domain()[0])}`
      + `,${Math.floor(this._xScale.domain()[1])}`;

    fetch(url, {
      method: 'GET',
    }).then(response => response.json())
      .then((content) => {
        console.log('content:', content);
      });

    console.log('url:', url);
    return url;
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

        console.log('savedRegions:', this.options.savedRegions)
      this.selectionXDomain = [
        this.options.savedRegions[onRect].x_start,
        this.options.savedRegions[onRect].x_end,
      ];
      this.draw();
    }
  }

  disableBrush() {
    if (this.gBrush) {
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

    this.localPubSub.publish('track.brushEnded', this.selected);
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
      this.options.savedRegions[this.selected].x_start = this.selectionXDomain[0];
      this.options.savedRegions[this.selected].x_end = this.selectionXDomain[1];
    } else if (this.newSelection) {
      // Nothing is selected, so we've just started brushing
      // a new selection. Create a new section
      // console.log('adding:', this.selectionXDomain);
      this.selected = this.options.savedRegions.length;
      this.options.savedRegions.push([{
        x_start: this.selectionXDomain[0],
        x_end: this.selectionXDomain[0],
        uid: slugid.nice(),
      }]);
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

  draw() {
    if (!this._xScale || !this.yScale) {
      return;
    }

    let dest = null;

    if (this.selectionXDomain) {
      const x0 = this._xScale(this.selectionXDomain[0]);
      const y0 = 0;

      const x1 = this._xScale(this.selectionXDomain[1]);
      const y1 = this.dimensions[1];

      dest = [[x0, y0], [x1, y1]];
    }

    let rectSelection = this.gMain.selectAll('.region')
      .data(
        this.options.savedRegions
          .map((r, i) => [r, i]) // keep track of the index of each
        // rectangle so that we can use it to alter the selection later
          .filter(r => r[1] !== this.selected)
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
        this.selected = d[1];
        this.enableBrush(d[1]);

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
    const maxInt = Number.MAX_SAFE_INTEGER;

    const zoomLevel = tileProxy.calculateZoomLevel(
      this._xScale, 0, maxInt, 256
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

    const tiles = xTiles.map(x => [zoomLevel, x]);

    console.log('tiles:', tiles);
    return tiles;
  }

  calculateVisibleTileIds() {
    const tiles = this.calculateVisibleTiles();

    return tiles.map(t => t.join('.'));
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
  }

  setPosition(newPosition) {
    super.setPosition(newPosition);

    this.draw();
  }
}

export default SelectionTrackHorizontal;
