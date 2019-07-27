import IntervalTree from './interval-tree';

function currTime() {
  const d = new Date();
  return d.getTime();
}

function segmentsToRows2(segments) {
  const t1 = currTime();
  segments.sort((a, b) => a.from - b.from);
  const rows = [];

  while (segments.length) {
    const row = [];
    let ix = 0;

    while (ix < segments.length) {
      if (row.length === 0
        || row[row.length - 1].to < segments[ix].from) {
        row.push(segments[ix]);
        segments.splice(ix, 1);
      } else {
        ix++;
      }
    }
    

    rows.push(row);
  }

  // console.log('rows:', rows);
  console.log('time:', currTime() - t1);
  return rows;
}

function segmentsToRows(segments) {
  /**
       * Partition a list of segments into an array of
       * rows containing the segments.
       *
       * @param segments: An array of segments (e.g. [{from: 10, to: 20}, {from: 18, to: 30}])
       * @return: An array of arrays of segments, representing
       *          non-overlapping rows of segments
       */
  // sort by the length of each segment
  return segmentsToRows2(segments);

  const t1 = currTime();
  segments.sort((a, b) => (b.to - b.from) - (a.to - a.from));

  const rows = [[]];
  const rowIts = [new IntervalTree()];

  // fill out each row with segments
  for (let i = 0; i < segments.length; i++) {
    let placed = false;

    for (let j = 0; j < rows.length; j++) {
      const it = rowIts[j]; // an interval tree

      const occluded = it.intersects([segments[i].from, segments[i].to]);

      if (!occluded) {
        // no intersections on this row, place this segment here
        it.add([segments[i].from, segments[i].to]);
        rows[j].push(segments[i]);
        placed = true;
        break;
      }
    }

    if (!placed) {
      const newTree = new IntervalTree();

      newTree.add([segments[i].from, segments[i].to]);
      rows.push([segments[i]]);
      rowIts.push(newTree);
    }
  }

  console.log('time:', currTime() - t1);
  return rows;
}

export default segmentsToRows;
