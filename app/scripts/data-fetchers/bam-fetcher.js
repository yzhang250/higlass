import slugid from 'slugid';
import { BamFile } from '@gmod/bam';
import ChromosomeInfo from '../ChromosomeInfo';

const getAlignments = (bamUrl, chromName, start, end) => {

};

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

    Promise.all([this.dataPromise, this.bamFile])
      .then((values) => {
        // we need to load the headers for the bam file but we don't
        // need to store them anywhere
        this.chromInfo = values[0];
      });
  }

  tilesetInfo(callback) {
    return this.dataPromise.then((chromInfo) => {
      const TILE_SIZE = 1024;

      const retVal = {
        tile_size: TILE_SIZE,
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
    return this.tilesetInfo().then((tsInfo) => {
      const tileWidth = +tsInfo.max_width / 2 ** (+z);
      const recordPromises = [];

      // get the bounds of the tile
      let minX = tsInfo.min_pos[0] + x * tileWidth;
      const maxX = tsInfo.min_pos[0] + (x + 1) * tileWidth;

      const chromLengths = this.chromInfo.chromLengths;
      const cumPositions = this.chromInfo.cumPositions;

      const alignments = [];

      for (let i = 0; i < cumPositions.length; i++) {
        const chromName = cumPositions[i].chrom;
        const chromStart = cumPositions[i].pos;

        console.log('cumPoss:', cumPositions[i]);
        console.log('chromName:', chromName, 'chromLenghts:', chromLengths);
        const chromEnd = cumPositions[i].pos + chromLengths[chromName];

        console.log('minX:', minX, 'maxX', maxX);
        console.log('chromStart', chromStart, 'chromEnd:', chromEnd);
        if (chromStart <= minX
          && minX < chromEnd) {
          // start of the visible region is within this chromosome

          if (maxX > chromEnd) {
            // the visible region extends beyond the end of this chromosome

            // fetch from the start until the end of the chromosome
            recordPromises.push(
              this.bamFile.getRecordsForRange(
                chromName, minX - chromStart, chromEnd - chromStart
              )
            );

            // continue onto the next chromosome
            minX = chromEnd;
          } else {
            // the end of the region is within this chromosome
            recordPromises.push(
              this.bamFile.getRecordsForRange(
                chromName, minX - chromStart, maxX - chromStart
              )
            );

            // end the loop because we've retrieved the last chromosome
            break;
          }
        }
      }

      console.log('recordPromises:', recordPromises);
      return Promise.all(recordPromises);
    });
  }
}

export default BAMDataFetcher;
