import IntervalTree from './interval-tree';

function currTime() {
  const d = new Date();
  return d.getTime();
}

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
        // while (currRowPosition < row.length) {
        //   if (row[currRowPosition].to < (segments[ix].from - padding)) {
        //     currRowPosition
        //   }
        // }

        // if (row.length === 0
        //   || row[currRowPosition].to < (segments[ix].from - padding)) {
        //   row.push(segments[ix]);
        //   segments.splice(ix, 1);
        // } else {
        //   ix++;
        // }
      }

      if (outputRows.length === currRow) {
        outputRows.push(row);
      } else {
        outputRows[currRow] = row;
      }
      // console.log("len:", outputRows.length);
      // outputRows.push(row);
    }

    currRow += 1;
  }

  return outputRows;
}

export default segmentsToRows;
