// workers/add.js
import { expose } from 'threads/worker';

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

expose((segmentList, xScale, position, dimensions) => 124
  // const t1 = currTime();

  // console.log('segmentList', segmentList.slice(0, 20));

  // const numSegments = segmentList.length;
  // const rows = segmentsToRows(segmentList);
  // const d = range(0, rows.length);
  // const r = [position[1], position[1] + dimensions[1]];
  // const yScale = scaleBand().domain(d).range(r);

  // const g = graphics;


  // g.clear();
  // g.lineStyle(1, 0x000000);

  // // const array = Uint8Array.from([0xff, 0x00, 0x00, 0xff]);
  // // console.log('array:', array);
  // // var texture = PIXI.Texture.fromBuffer(
  // // array, 1, 1);
  // // const sprite = new PIXI.Sprite(texture);
  // // console.log('sprite 1:', sprite);

  // // sprite.width=300;
  // // sprite.height=300;
  // // g.addChild(sprite)

  // let mds = 0;

  // rows.map((row, i) => {
  //   row.map((segment, j) => {
  //     const from = xScale(segment.from);
  //     const to = xScale(segment.to);
  //     // console.log('from:', from, 'to:', to);
  //     // console.log('yScale(i)', yScale(i), yScale.bandwidth());

  //     g.beginFill(0xffffff);
  //     g.drawRect(
  //       from,
  //       yScale(i), to - from, yScale.bandwidth()
  //     );

  //     if (segment.md) {
  //       const substitutions = parseMD(segment.md);

  //       g.lineStyle(0, 0x000000);
  //       for (const substitution of substitutions) {
  //         // const sprite = new PIXI.Sprite(texture);
  //         // sprite.x = xScale(segment.from + substitution.pos - 1);
  //         // sprite.y = yScale(i);

  //         // sprite.width = Math.max(1, xScale(1) - xScale(0));
  //         // sprite.height = yScale.bandwidth();

  //         // g.addChild(sprite);
  //         mds += 1;
  //         g.beginFill(baseColors[substitution.base]);

  //         g.drawRect(
  //           xScale(segment.from + substitution.pos - 1),
  //           yScale(i),
  //           Math.max(1, xScale(1) - xScale(0)),
  //           yScale.bandwidth(),
  //         );
  //       }
  //       g.lineStyle(1, 0x000000);
  //     }

  //     // if (segment.differences) {
  //     //   for (const diff of segment.differences) {
  //     //     g.beginFill(0xff00ff);
  //     //     const start = this._xScale(segment.from + diff[0]);
  //     //     const end = this._xScale(segment.from + diff[0] + 1);

  //     //     console.log('drawing rect', start, yScale(i), end - start, yScale.bandwidth());
  //     //     g.drawRect(
  //     //       start,
  //     //       yScale(i), end - start, yScale.bandwidth()
  //     //     );
  //     //   }
  //     // }
  //   });
  // });
  // const t2 = currTime();
  // console.log('mds:', mds);
  // console.log('perSegment', 100 * (t2 - t1) / numSegments, 'drawSegments', t2 - t1, '# of segments:', numSegments);

  // return graphics;
);
