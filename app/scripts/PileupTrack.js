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

const drawSegments = (segmentList, graphics, xScale,
  position, dimensions, prevRows) => {
  const t1 = currTime();

  const allPositions = new Float32Array(2 ** 20);
  let currPosition = 0;

  const allColors = new Float32Array(2 ** 21);
  let currColor = 0;

  const addPosition = (x1, y1) => {
    allPositions[currPosition++] = x1;
    allPositions[currPosition++] = y1;
  };

  const addColor = (r, g, b, a, n) => {
    for (let k = 0; k < n; k++) {
      allColors[currColor++] = r;
      allColors[currColor++] = g;
      allColors[currColor++] = b;
      allColors[currColor++] = a;
    }
  };

  // console.log('segmentList', segmentList.slice(0, 20));

  const numSegments = segmentList.length;
  const rows = segmentsToRows(segmentList, {
    prevRows,
  });
  const d = range(0, rows.length);
  const r = [position[1], position[1] + dimensions[1]];
  const yScale = scaleBand().domain(d).range(r).paddingInner(0.2);

  // console.log('rows:', rows);
  // console.log('idsToRows', idsToRows);

  const graphicsRects = 0;

  const currGraphics = new PIXI.Graphics();
  graphics.addChild(currGraphics);


  currGraphics.clear();
  currGraphics.lineStyle(1, 0x000000);

  const positions = [];
  const colors = [];

  let mds = 0;

  let xLeft; let xRight; let yTop; let
    yBottom;

  rows.map((row, i) => {
    row.map((segment, j) => {
      const from = xScale(segment.from);
      const to = xScale(segment.to);
      // console.log('from:', from, 'to:', to);
      // console.log('yScale(i)', yScale(i), yScale.bandwidth());

      xLeft = from;
      xRight = to;
      yTop = yScale(i);
      yBottom = yTop + yScale.bandwidth();
      // currGraphics.beginFill(0xffffff);
      // currGraphics.drawRect(
      //   from,
      //   yScale(i), to - from, yScale.bandwidth()
      // );
      // positions.push(xLeft, yTop, xRight, yTop, xLeft, yBottom);

      addPosition(xLeft, yTop);
      addPosition(xRight, yTop);
      addPosition(xLeft, yBottom);

      addPosition(xLeft, yBottom);
      addPosition(xRight, yTop);
      addPosition(xRight, yBottom);

      addColor(0.8, 0.8, 0.8, 1, 6);

      if (segment.md) {
        const substitutions = parseMD(segment.md);

        for (const substitution of substitutions) {
          mds += 1;

          xLeft = xScale(segment.from + substitution.pos - 1);
          xRight = xLeft + Math.max(1, xScale(1) - xScale(0));
          yTop = yScale(i);
          yBottom = yTop + yScale.bandwidth();

          addPosition(xLeft, yTop);
          addPosition(xRight, yTop);
          addPosition(xLeft, yBottom);

          addPosition(xLeft, yBottom);
          addPosition(xRight, yTop);
          addPosition(xRight, yBottom);

          if (substitution.base === 'A') {
            addColor(0, 0, 1, 1, 6);
          } else if (substitution.base === 'C') {
            addColor(1, 0, 0, 1, 6);
          } else if (substitution.base === 'G') {
            addColor(0, 1, 0, 1, 6);
          } else if (substitution.base === 'T') {
            addColor(1, 1, 0, 1, 6);
          } else {
            addColor(0, 0, 0, 1, 6);
          }
        }
      }
    });
  });


  const geometry = new PIXI.Geometry()
    .addAttribute('position', allPositions.slice(0, currPosition), 2);// x,y
  geometry.addAttribute('aColor', allColors.slice(0, currColor), 4);

  const state = new PIXI.State();
  const mesh = new PIXI.Mesh(geometry, shader, state);

  graphics.addChild(mesh);
  const t2 = currTime();
  console.log('mds:', mds);
  console.log('perSegment', 100 * (t2 - t1) / numSegments, 'drawSegments', t2 - t1, '# of segments:', numSegments);

  return rows;
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

    const newGraphics = new PIXI.Graphics();

    this.prevRows = drawSegments(
      Object.values(allSegments),
      newGraphics,
      this._xScale,
      this.position,
      this.dimensions,
      this.prevRows,
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
