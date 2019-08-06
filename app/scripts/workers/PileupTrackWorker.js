// workers/add.js
import { scaleLinear, scaleBand } from 'd3-scale';
import { range } from 'd3-array';
import { expose } from 'threads/worker';
// import { segmentsToRows, parseMD } from '../utils';

function currTime() {
  const d = new Date();
  return d.getTime();
}

const parseMD = (mdString, useCounts) => {
  let currPos = 1;
  let lettersBefore = [];
  const substitutions = [];

  for (let i = 0; i < mdString.length; i++) {
    // console.log(mdString[i], mdString[i].match(/[0-9]/));

    if (mdString[i].match(/[0-9]/g)) {
      // a number, keep on going
      lettersBefore.push(mdString[i]);
    } else {
      if (lettersBefore.length) {
        currPos += +lettersBefore.join('');
      }

      if (useCounts) {
        substitutions.push({
          length: +lettersBefore.join(''),
          type: mdString[i],
        });
      } else {
        substitutions.push({
          pos: currPos,
          base: mdString[i + 0],
          length: 1,
        });
      }

      lettersBefore = [];
      currPos += 1;
    }
  }

  return substitutions;
};

function segmentsToRows(segments, optionsIn) {
  const { prevRows, padding } = Object.assign(
    { prevRows: [], padding: 5 },
    optionsIn || {}
  );

  const t1 = currTime();
  segments.sort((a, b) => a.from - b.from);
  const rows = [];

  const t11 = currTime();
  const rowIds = new Set(prevRows.flatMap(x => x).map(x => x.id));

  // console.log('flatMap:', prevRows.flatMap(x => x).map(x => x.id));
  // console.log('rowIds:', rowIds);
  // we only want to go through the segments that
  // don't already have a row
  const filteredSegments = segments.filter(
    x => !rowIds.has(x.id)
  );

  // console.log('filteredSegments.length:', filteredSegments.length);

  // we also want to remove all row entries that are
  // not in our list of segments
  const segmentIds = new Set(
    segments.map(x => x.id)
  );
  const newRows = prevRows.map(
    row => row.filter(segment => segmentIds.has(segment.id))
  );

  const t12 = currTime();
  console.log('segment times', t12 - t11);

  let currRow = 0;

  const outputRows = newRows;

  while (filteredSegments.length) {
    const row = newRows[currRow] || [];
    let currRowPosition = 0;
    let ix = filteredSegments.length - 1;
    let startingIx = 0;

    // pass once to find out where the first segment to
    // intersect an existing segment is
    if (row.length > 0) {
      while (ix >= 0 && ix < filteredSegments[ix].length) {
        if (row[0].from <= filteredSegments[ix].from) {
          break;
        } else {
          ix++;
        }
      }
      startingIx = Math.min(ix, filteredSegments.length - 1);
    } else {
      // nothing in this row so we can safely start at index 0
      startingIx = 0;
    }

    for (const direction of [1, -1]) {
      ix = Math.min(startingIx, filteredSegments.length - 1);

      while ((direction === 1 && ix < filteredSegments.length)
        || (direction === -1
          && ix >= 0
          && startingIx > 0
          && filteredSegments.length)) {
        const seg = filteredSegments[ix];

        if (row.length === 0) {
          // row is empty, add the segment
          row.push(seg);
          // console.log('adding:', seg, row.slice(0));
          filteredSegments.splice(ix, 1);
          ix += direction;
          continue;
        }

        let intersects = false;
        while (currRowPosition < row.length) {
          if (row[currRowPosition].from
            < (seg.to + padding)) {
            // this row starts before or within the segment
            if ((seg.from - padding) < row[currRowPosition].to) {
              // this row intersects the segment;
              intersects = true;
              break;
            } else {
              // it's before this segment
              currRowPosition++;
            }
          } else {
            // this row is after the current segment
            break;
          }
        }

        if (intersects) {
          ix += direction;
          continue;
        }

        if (currRowPosition >= row.length) {
          // we're past the last element in the row so we can
          // add this segment
          row.push(seg);
          // console.log('adding:', seg, row.slice(0));
          filteredSegments.splice(ix, 1);
        } else if (seg.to + padding < row[currRowPosition].from) {
          // we have space to insert an element before
          // the next segment
          row.splice(currRowPosition, 0, seg);
          filteredSegments.splice(ix, 1);
        }

        ix += direction;
      }

      if (outputRows.length === currRow) {
        outputRows.push(row);
      } else {
        outputRows[currRow] = row;
      }
    }

    currRow += 1;
  }

  const t2 = currTime();
  console.log('segmentsToRows time', t2 - t1);
  return outputRows;
}

expose(
  (segmentList, domain, scaleRange, position, dimensions, prevRows) => {
    const xScale = scaleLinear().domain(domain).range(scaleRange);
    const t1 = currTime();

    const STARTING_POSITIONS_ARRAY_LENGTH = 2 ** 20;
    const STARTING_COLORS_ARRAY_LENGTH = 2 ** 21;

    let allPositionsLength = STARTING_POSITIONS_ARRAY_LENGTH;
    let allColorsLength = STARTING_COLORS_ARRAY_LENGTH;

    let allPositions = new Float32Array(allPositionsLength);
    let currPosition = 0;

    let allColors = new Float32Array(allColorsLength);
    let currColor = 0;

    const addPosition = (x1, y1) => {
      if (currPosition > allPositionsLength - 2) {
        allPositionsLength *= 2;
        const prevAllPositions = allPositions;

        allPositions = new Float32Array(allPositionsLength);
        allPositions.set(prevAllPositions);
      }
      allPositions[currPosition++] = x1;
      allPositions[currPosition++] = y1;
    };

    const addColor = (r, g, b, a, n) => {
      if (currColor >= allColorsLength - n * 4) {
        allColorsLength *= 2;
        const prevAllColors = allColors;

        allColors = new Float32Array(allColorsLength);
        allColors.set(prevAllColors);
      }

      for (let k = 0; k < n; k++) {
        allColors[currColor++] = r;
        allColors[currColor++] = g;
        allColors[currColor++] = b;
        allColors[currColor++] = a;
      }
    };

    // segmentList.slice(0, 30)
    // .forEach(x => {
    //   console.log(x.cigar, x);
    // })

    const numSegments = segmentList.length;
    const rows = segmentsToRows(segmentList, {
      prevRows,
    });
    const d = range(0, rows.length);
    const r = [position[1], position[1] + dimensions[1]];
    const yScale = scaleBand().domain(d).range(r).paddingInner(0.2);

    // console.log('rows:', rows);
    // console.log('idsToRows', idsToRows);

    // const currGraphics = new PIXI.Graphics();
    // graphics.addChild(currGraphics);

    // currGraphics.clear();
    // currGraphics.lineStyle(1, 0x000000);

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
          const cigarSubs = parseMD(segment.cigar, true);

          const firstSub = cigarSubs[0];
          const lastSub = cigarSubs[cigarSubs.length - 1];
          // console.log('firstSub:', firstSub), cigarSubs;

          // positions are from the beginning of the read
          if (firstSub.type === 'S') {
            // soft clipping at the beginning
            substitutions.push({
              pos: -firstSub.length + 1,
              type: 'S',
              length: firstSub.length,
            });
          } else if (lastSub.type === 'S') {
            // soft clipping at the end
            substitutions.push({
              pos: (segment.to - segment.from) + 1,
              length: lastSub.length,
              type: 'S',
            });
          }

          // console.log('cigarSubs', segment.cigar, cigarSubs);

          for (const substitution of substitutions) {
            mds += 1;

            xLeft = xScale(segment.from + substitution.pos - 1);
            xRight = xLeft + Math.max(1, xScale(substitution.length) - xScale(0));
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
            } else if (substitution.type === 'S') {
              addColor(0, 1, 1, 0.5, 6);
            } else {
              addColor(0, 0, 0, 1, 6);
            }
          }
        }
      });
    });


    // const geometry = new PIXI.Geometry()
    //   .addAttribute('position', allPositions.slice(0, currPosition), 2);// x,y
    // geometry.addAttribute('aColor', allColors.slice(0, currColor), 4);

    // const state = new PIXI.State();
    // const mesh = new PIXI.Mesh(geometry, shader, state);

    // graphics.addChild(mesh);
    // const t2 = currTime();
    // console.log('mds:', mds);
    // console.log('perSegment', 100 * (t2 - t1) / numSegments, 'drawSegments', t2 - t1, '# of segments:', numSegments);

    const positions = allPositions.slice(0, currPosition);
    const colors = allColors.slice(0, currColor);

    console.log('rects:', positions.length / 6);
    console.log('rows:', rows.length);
    return {
      rows,
      positions,
      colors,
      xScaleDomain: domain,
      xScaleRange: scaleRange,
    };
  }
);
