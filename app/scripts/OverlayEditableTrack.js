import {
  brush as d3brush,
  brushX as d3brushX,
  brushY as d3brushY
} from 'd3-brush';
import { event } from 'd3-selection';
import slugid from 'slugid';

import SVGTrack from './SVGTrack';

function cleanBrushG(g) {
  // turn off the ability to select new regions for this brush
  g.selectAll('.overlay').style('pointer-events', 'none');
  // turn off the ability to modify the aspect ratio of the brush
  g.selectAll('.handle--ne').style('pointer-events', 'none');
  g.selectAll('.handle--nw').style('pointer-events', 'none');
  g.selectAll('.handle--sw').style('pointer-events', 'none');
  g.selectAll('.handle--se').style('pointer-events', 'none');
  g.selectAll('.handle--n').style('pointer-events', 'none');
  g.selectAll('.handle--s').style('pointer-events', 'none');
  return g;
}

class OverlayEditableTrack extends SVGTrack {
  constructor(context, options) {
    super(context, options);
    const {
      registerViewportChanged,
      removeViewportChanged,
      setExtentCallback
    } = context;

    const uid = slugid.nice();
    this.uid = uid;
    this.options = options;

    this.removeViewportChanged = removeViewportChanged;
    this.setExtentCallback = setExtentCallback;

    this.viewportXDomain = this.options.extent[0];
    this.viewportYDomain = [0, 0];

    this.brushes = [];

    if (Array.isArray(this.options.extent)) {
      this.options.orientationsAndPositions.forEach((op, opI) => {
        let brush;
        let xDomain;
        let yDomain;
        if (op.orientation === '1d-horizontal') {
          brush = d3brushX();
          xDomain = this.options.extent[opI];
          yDomain = [op.position.top, op.position.top + op.position.height];
        } else if (op.orientation === '1d-vertical') {
          brush = d3brushY();
          xDomain = [op.position.left, op.position.left + op.position.width];
          yDomain = this.options.extent[opI];
        } else if (op.orientation === '2d') {
          brush = d3brush();
          xDomain = [this.options.extent[opI][0], this.options.extent[opI][1]];
          yDomain = [this.options.extent[opI][2], this.options.extent[opI][3]];
        }

        brush.on('brush', () => this.brushed(opI));
        const g = cleanBrushG(
          this.gMain
            .append('g')
            .attr('id', `brush-${this.uid}-${opI}`)
            .call(brush)
        );
        this.brushes.push({
          brush,
          g,
          xDomain,
          yDomain
        });
      });
    }

    registerViewportChanged(uid, this.viewportChanged.bind(this));

    // the viewport will call this.viewportChanged immediately upon
    // hearing registerViewportChanged
    this.draw();
  }

  brushed(opI) {
    /**
     * Should only be called  on active brushing, not in response to the
     * draw event
     */
    const s = event.selection;

    if (!this._xScale || !this._yScale) {
      return;
    }
    if (this._xScale) {
      this.viewportXDomain = [
        this._xScale.invert(s[0]),
        this._xScale.invert(s[1])
      ];
    }

    if (this._yScale) {
      this.viewportYDomain = [
        this._yScale.invert(s[0]),
        this._yScale.invert(s[1])
      ];
    }

    this.setExtentCallback([this.viewportXDomain]);
  }

  viewportChanged(viewportXScale, viewportYScale, update = true) {
    // console.log('viewport changed:', viewportXScale.domain());
    this.viewportXDomain = viewportXScale.domain();
    this.viewportYDomain = viewportYScale.domain();

    this.draw();
  }

  remove() {
    // remove the event handler that updates this viewport tracker
    this.removeViewportChanged(this.uid);

    super.remove();
  }

  rerender() {
    // set the fill and stroke colors
    this.brushes.forEach(d => {
      d.g
        .selectAll('.selection')
        .attr('fill', this.options.fill)
        .attr('fill-opacity', this.options.fillOpacity)
        .attr('stroke', this.options.stroke)
        .attr('stroke-opacity', this.options.strokeOpacity)
        .attr('stroke-width', this.options.strokeWidth);
    });
  }

  draw() {
    if (!this._xScale || !this.yScale) {
      return;
    }

    if (!this.viewportXDomain || !this.viewportYDomain) {
      return;
    }

    const x0 = this._xScale(this.viewportXDomain[0]);
    const x1 = this._xScale(this.viewportXDomain[1]);

    const dest = [x0, x1];

    // console.log('dest:', dest[0], dest[1]);

    // user hasn't actively brushed so we don't want to emit a
    // 'brushed' event
    this.brushes.forEach(d => {
      d.brush.on('brush', null);
    });
    this.brushes.forEach(d => {
      d.g.call(d.brush.move, dest);
    });
    this.brushes.forEach((d, i) => {
      d.brush.on('brush', () => this.brushed(i));
    });
  }

  zoomed(newXScale, newYScale) {
    this.xScale(newXScale);
    this.yScale(newYScale);

    this.draw();
  }

  setPosition(newPosition) {
    super.setPosition(newPosition);

    this.draw();
  }

  setDimensions(newDimensions) {
    super.setDimensions(newDimensions);

    const xRange = this._xScale.range();
    const yRange = this._yScale.range();
    const xDiff = xRange[1] - xRange[0];

    this.brushes.forEach(d => {
      d.brush.extent([
        [xRange[0] - xDiff, yRange[0]],
        [xRange[1] + xDiff, yRange[1]]
      ]);
      d.g.call(d.brush);
    });

    this.draw();
  }
}

export default OverlayEditableTrack;
