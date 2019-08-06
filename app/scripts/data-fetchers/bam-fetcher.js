import slugid from 'slugid';
import { BamFile } from '@gmod/bam';
import ChromosomeInfo from '../ChromosomeInfo';

// const t = new BamFile({
//   bamUrl: 'https://pkerp.s3.amazonaws.com/public/bamfile_test/SRR1770413.sorted.bam',
// });

// t.getHeader()
//   .then((header) => {
//     console.log('header:', header);
//     t.getRecordsForRange('Chromosome', 0, 1000)
//       .then((records) => {
//         for (let i = 0; i < 2; i++) {
//           console.log('records[i]', records[i].get('seq'));
//         }
//         console.log('records:', records);
//       });
//   });
const bamRecordToJson = bamRecord => ({
  id: bamRecord._id,
  from: +bamRecord.data.start,
  to: +bamRecord.data.end,
  md: bamRecord.get('MD'),
  cigar: bamRecord.get('cigar'),
});

class BAMDataFetcher {
  constructor(dataConfig) {
    this.dataConfig = dataConfig;
    this.trackUid = slugid.nice();

    this.bamFile = new BamFile({
      bamUrl: dataConfig.url
    });

    this.dataPromise = new Promise((resolve, reject) => {
      ChromosomeInfo(dataConfig.chromSizesUrl, resolve);
    });

    this.bamHeader = this.bamFile.getHeader();

    // Promise.all([this.dataPromise, this.bamHeader])
    //   .then((values) => {
    //     // we need to load the headers for the bam file but we don't
    //     // need to store them anywhere
    //     this.chromInfo = values[0];

    //     console.log('chromInfo:', this.chromInfo);
    //   });
  }

  tilesetInfo(callback) {
    return Promise.all([this.dataPromise, this.bamHeader]).then((values) => {
      const TILE_SIZE = 1024;
      const chromInfo = values[0];
      this.chromInfo = chromInfo;

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

      if (callback) {
        callback(retVal);
      }

      return retVal;
    });
  }

  fetchTilesDebounced(receivedTiles, tileIds) {
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
      tilePromises.push(this.tile(z, x));
    }

    Promise.all(tilePromises).then((values) => {
      for (let i = 0; i < values.length; i++) {
        const validTileId = validTileIds[i];
        tiles[validTileId] = values[i];
        tiles[validTileId].tilePositionId = validTileId;
      }

      receivedTiles(tiles);
    });
    // tiles = tileResponseToData(tiles, null, tileIds);
    return tiles;
  }

  tile(z, x) {
    const MAX_TILE_WIDTH = 200000;

    return this.tilesetInfo().then((tsInfo) => {
      const tileWidth = +tsInfo.max_width / 2 ** (+z);
      const recordPromises = [];

      console.log(`z: ${z}, tileWidth: ${tileWidth}`);

      if (tileWidth > MAX_TILE_WIDTH) {
        // this.errorTextText('Zoomed out too far for this track. Zoomin further to see reads');
        return new Promise((resolve, reject) => resolve([]));
      }

      // get the bounds of the tile
      let minX = tsInfo.min_pos[0] + x * tileWidth;
      const maxX = tsInfo.min_pos[0] + (x + 1) * tileWidth;

      const chromLengths = this.chromInfo.chromLengths;
      const cumPositions = this.chromInfo.cumPositions;

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
              this.bamFile.getRecordsForRange(
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
              this.bamFile.getRecordsForRange(
                chromName, startPos, endPos, {
                  // viewAsPairs: true,
                  // maxInsertSize: 2000,
                }
              ).then(records => {
                // console.log('records:', records);
                return records.map(rec => bamRecordToJson(rec));
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
  }
}

export default BAMDataFetcher;
