import slugid from 'slugid';
import ChromosomeInfo from '../ChromosomeInfo';

class BAMDataFetcher {
  constructor(dataConfig) {
    this.dataConfig = dataConfig;
    this.trackUid = slugid.nice();


    this.dataPromise = new Promise((resolve, reject) => {
      ChromosomeInfo(dataConfig.chromSizesUrl, resolve);
    });

    this.dataPromise.then((chromInfo) => {
      console.log('chromInfo:', chromInfo);
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

      console.log('retVal:', retVal);

      if (callback) {
        callback(retVal);
      }

      return retVal;
    });
  }

  fetchTilesDebounced(receivedTiles, tileIds) {
    return 0;
  }

  tile(z, x) {
    return 0;
  }
}

export default BAMDataFetcher;
