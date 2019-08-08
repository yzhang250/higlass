import { text } from 'd3-request';
import { bisector, range } from 'd3-array';
import { tsvParseRows } from 'd3-dsv';
import { scaleLinear, scaleBand } from 'd3-scale';
import { expose, Transfer } from 'threads/worker';
import { BamFile } from '@gmod/bam';

// ///////////////////////////////////////////////
// / ChromInfo
// ///////////////////////////////////////////////

const chromInfoBisector = bisector(d => d.pos).left;

const chrToAbs = (chrom, chromPos, chromInfo) => chromInfo.chrPositions[chrom].pos + chromPos;

const absToChr = (absPosition, chromInfo) => {
  if (!chromInfo || !chromInfo.cumPositions || !chromInfo.cumPositions.length) {
    return null;
  }

  let insertPoint = chromInfoBisector(chromInfo.cumPositions, absPosition);
  const lastChr = chromInfo.cumPositions[chromInfo.cumPositions.length - 1].chr;
  const lastLength = chromInfo.chromLengths[lastChr];

  insertPoint -= insertPoint > 0 && 1;

  let chrPosition = Math.floor(
    absPosition - chromInfo.cumPositions[insertPoint].pos,
  );
  let offset = 0;

  if (chrPosition < 0) {
    // before the start of the genome
    offset = chrPosition - 1;
    chrPosition = 1;
  }

  if (
    insertPoint === chromInfo.cumPositions.length - 1
    && chrPosition > lastLength
  ) {
    // beyond the last chromosome
    offset = chrPosition - lastLength;
    chrPosition = lastLength;
  }

  return [
    chromInfo.cumPositions[insertPoint].chr,
    chrPosition,
    offset,
    insertPoint,
  ];
};

function parseChromsizesRows(data) {
  const cumValues = [];
  const chromLengths = {};
  const chrPositions = {};

  let totalLength = 0;

  for (let i = 0; i < data.length; i++) {
    const length = Number(data[i][1]);
    totalLength += length;

    const newValue = {
      id: i,
      chr: data[i][0],
      pos: totalLength - length,
    };

    cumValues.push(newValue);
    chrPositions[newValue.chr] = newValue;
    chromLengths[data[i][0]] = length;
  }

  return {
    cumPositions: cumValues,
    chrPositions,
    totalLength,
    chromLengths,
  };
}

function ChromosomeInfo(filepath, success) {
  const ret = {};

  ret.absToChr = absPos => (ret.chrPositions
    ? absToChr(absPos, ret)
    : null
  );

  ret.chrToAbs = ([chrName, chrPos] = []) => (ret.chrPositions
    ? chrToAbs(chrName, chrPos, ret)
    : null
  );

  return text(filepath, (error, chrInfoText) => {
    if (error) {
      // console.warn('Chromosome info not found at:', filepath);
      if (success) success(null);
    } else {
      const data = tsvParseRows(chrInfoText);
      const chromInfo = parseChromsizesRows(data);

      Object.keys(chromInfo).forEach((key) => {
        ret[key] = chromInfo[key];
      });
      if (success) success(ret);
    }
  });
}

// ///////////////////////////////////////////////////
// / End Chrominfo
// ///////////////////////////////////////////////////

const bamRecordToJson = bamRecord => ({
  id: bamRecord._id,
  from: +bamRecord.data.start,
  to: +bamRecord.data.end,
  md: bamRecord.get('MD'),
  cigar: bamRecord.get('cigar'),
});

// promises indexed by urls
const bamFiles = {};
const bamHeaders = {};

// promises indexed by url
const chromSizes = {};
const chromInfos = {};
const tileValues = {};

// indexed by uuid
const dataConfs = {};
const init = (uid, bamUrl, chromSizesUrl) => {
  if (!bamFiles[bamUrl]) {
    bamFiles[bamUrl] = new BamFile({
      bamUrl,
    });

    // we have to fetch the header before we can fetch data
    bamHeaders[bamUrl] = bamFiles[bamUrl].getHeader();
  }

  chromSizes[chromSizesUrl] = chromSizes[chromSizesUrl]
    || new Promise((resolve, reject) => {
      ChromosomeInfo(chromSizesUrl, resolve);
    });

  dataConfs[uid] = {
    bamUrl, chromSizesUrl
  };
};

const tilesetInfo = (uid) => {
  const { chromSizesUrl, bamUrl } = dataConfs[uid];

  return Promise.all(
    [chromSizes[chromSizesUrl], bamHeaders[bamUrl]]
  ).then((values) => {
    // console.log('values:', values);

    const TILE_SIZE = 1024;
    const chromInfo = values[0];

    chromInfos[chromSizesUrl] = chromInfo;

    const retVal = {
      tile_size: TILE_SIZE,
      bins_per_dimension: TILE_SIZE,
      max_zoom: Math.ceil(
        Math.log(chromInfo.totalLength / TILE_SIZE) / Math.log(2)
      ),
      max_width: chromInfo.totalLength,
      min_pos: [0],
      max_pos: [chromInfo.totalLength],
    };

    return retVal;
  });
};

const tile = async (uid, z, x) => {
  const MAX_TILE_WIDTH = 200000;
  const { bamUrl, chromSizesUrl } = dataConfs[uid];
  const bamFile = bamFiles[bamUrl];

  return tilesetInfo(uid).then((tsInfo) => {
    const tileWidth = +tsInfo.max_width / 2 ** (+z);
    const recordPromises = [];

    if (tileWidth > MAX_TILE_WIDTH) {
      // this.errorTextText('Zoomed out too far for this track. Zoomin further to see reads');
      return new Promise((resolve, reject) => resolve([]));
    }

    // get the bounds of the tile
    let minX = tsInfo.min_pos[0] + x * tileWidth;
    const maxX = tsInfo.min_pos[0] + (x + 1) * tileWidth;

    const chromInfo = chromInfos[chromSizesUrl];

    const chromLengths = chromInfo.chromLengths;
    const cumPositions = chromInfo.cumPositions;

    for (let i = 0; i < cumPositions.length; i++) {
      const chromName = cumPositions[i].chr;
      const chromStart = cumPositions[i].pos;

      // console.log('cumPoss:', cumPositions[i]);
      // console.log('chromName:', chromName, 'chromLenghts:', chromLengths);
      const chromEnd = cumPositions[i].pos + chromLengths[chromName];

      // console.log('minX:', minX, 'maxX', maxX);
      // console.log('chromStart', chromStart, 'chromEnd:', chromEnd);
      if (chromStart <= minX
        && minX < chromEnd) {
        // start of the visible region is within this chromosome

        if (maxX > chromEnd) {
          // the visible region extends beyond the end of this chromosome

          // fetch from the start until the end of the chromosome
          recordPromises.push(
            bamFile.getRecordsForRange(
              chromName, minX - chromStart, chromEnd - chromStart
            ).then(records => records.map(rec => bamRecordToJson(rec)))
          );

          // continue onto the next chromosome
          minX = chromEnd;
        } else {
          const endPos = Math.ceil(maxX - chromStart);
          const startPos = Math.floor(minX - chromStart);
          // the end of the region is within this chromosome
          recordPromises.push(
            bamFile.getRecordsForRange(
              chromName, startPos, endPos, {
                // viewAsPairs: true,
                // maxInsertSize: 2000,
              }
            ).then((records) => {
              tileValues[`${uid}.${z}.${x}`] = records.map(rec => bamRecordToJson(rec));

              return [];
            })
          );

          // end the loop because we've retrieved the last chromosome
          break;
        }
      }
    }

    // console.log('recordPromises:', recordPromises);
    // flatten the array of promises so that it looks like we're
    // getting one long list of value
    return Promise.all(recordPromises)
      .then(values => values.flat());
  });
};

const fetchTilesDebounced = async (uid, tileIds) => {
  const tiles = {};

  const validTileIds = [];
  const tilePromises = [];

  for (const tileId of tileIds) {
    const parts = tileId.split('.');
    const z = parseInt(parts[0], 10);
    const x = parseInt(parts[1], 10);

    if (Number.isNaN(x) || Number.isNaN(z)) {
      console.warn('Invalid tile zoom or position:', z, x);
      continue;
    }

    validTileIds.push(tileId);
    tilePromises.push(tile(uid, z, x));
  }

  return Promise.all(tilePromises).then((values) => {
    for (let i = 0; i < values.length; i++) {
      const validTileId = validTileIds[i];
      tiles[validTileId] = values[i];
      tiles[validTileId].tilePositionId = validTileId;
    }

    return tiles;
  });
};

// /////////////////////////////////////////////////
// / Render Functions
// /////////////////////////////////////////////////

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

  const t1 = performance.now();
  segments.sort((a, b) => a.from - b.from);

  const t11 = performance.now();
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

  const t12 = performance.now();
  // eslint-disable-next-line
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

  const t2 = performance.now();
  // eslint-disable-next-line
  console.log('segmentsToRows took', t2 - t1, '# of segments:', segments.length);
  return outputRows;
}

const STARTING_POSITIONS_ARRAY_LENGTH = 2 ** 20;
const STARTING_COLORS_ARRAY_LENGTH = 2 ** 16;

let allPositionsLength = STARTING_POSITIONS_ARRAY_LENGTH;
let allColorsLength = STARTING_COLORS_ARRAY_LENGTH;

let allPositions = new Float32Array(allPositionsLength);
let allColors = new Float32Array(allColorsLength);

const renderSegments = (
  uid, tileIds, domain, scaleRange, position, dimensions, prevRows
) => {
  const allSegments = {};

  for (const tileId of tileIds) {
    for (const segment of tileValues[`${uid}.${tileId}`]) {
      allSegments[segment.id] = segment;
    }
  }

  const segmentList = Object.values(allSegments);
  const xScale = scaleLinear().domain(domain).range(scaleRange);

  let currPosition = 0;

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

  let currColor = 0;

  const addColor = (colorCode, n) => {
    if (currColor >= allColorsLength) {
      allColorsLength *= 2;
      const prevAllColors = allColors;

      allColors = new Float32Array(allColorsLength);
      allColors.set(prevAllColors);
    }

    for (let i = 0; i < n; i++) {
      allColors[currColor++] = colorCode;
    }
  };

  // segmentList.slice(0, 30)
  // .forEach(x => {
  //   console.log(x.cigar, x);
  // })

  const rows = segmentsToRows(segmentList, { prevRows });
  const d = range(0, rows.length);
  const r = [position[1], position[1] + dimensions[1]];
  const yScale = scaleBand().domain(d).range(r).paddingInner(0.2);

  // console.log('rows:', rows);
  // console.log('idsToRows', idsToRows);

  // const currGraphics = new PIXI.Graphics();
  // graphics.addChild(currGraphics);

  // currGraphics.clear();
  // currGraphics.lineStyle(1, 0x000000);

  let xLeft;
  let xRight;
  let yTop;
  let yBottom;

  const t1 = performance.now();

  rows.forEach((row, i) => {
    row.forEach((segment, j) => {
      // console.log('from:', from, 'to:', to);
      // console.log('yScale(i)', yScale(i), yScale.bandwidth());

      xLeft = xScale(segment.from);
      xRight = xScale(segment.to);
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

      addColor(0, 6);

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

          // Convert the character into an integer
          const charCode = (
            (substitution.base && substitution.base.charCodeAt(0)) || 1
          );
          // In the following `charCode % 65` will be `0` IFF the code is an A.
          // If we invert the zero to a 1 using `!` and multiply by the
          // corresponding color-code (e.g., 0, 1, 2, ...) we can get the code
          // without any if statement and avoid branching issues.
          addColor(
            !(charCode % 65) // A == 1
            + !(charCode % 67) * 2 // C == 2
            + !(charCode % 71) * 3 // G == 3
            + !(charCode % 84) * 4 // T == 4
            + !(charCode % 83) * 5, // S == 5
            6
          );
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

  const positionsBuffer = allPositions.slice(0, currPosition).buffer;
  const colorsBuffer = allColors.slice(0, currColor).buffer;

  // console.log('rects:', positions.length / 6);
  // console.log('rows:', rows.length);
  // console.log('positions:', positions);
  // console.log('colors:', colors);

  const objData = {
    rows,
    positionsBuffer,
    colorsBuffer,
    xScaleDomain: domain,
    xScaleRange: scaleRange,
  };

  // eslint-disable-next-line
  console.log('renderSegments took', performance.now() - t1);

  // Fritz: why are the two buffers returned twice?
  return Transfer(objData, [positionsBuffer, colorsBuffer]);
};

const tileFunctions = {
  init,
  tilesetInfo,
  fetchTilesDebounced,
  tile,
  renderSegments,
};

expose(tileFunctions);
