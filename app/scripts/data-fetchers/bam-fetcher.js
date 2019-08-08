import slugid from 'slugid';
import { spawn, Worker } from 'threads';


class BAMDataFetcher {
  constructor(dataConfig) {
    this.dataConfig = dataConfig;
    this.uid = slugid.nice();

    this.worker = spawn(
      new Worker('./bam-fetcher-worker.js')
    );

    this.initPromise = this.worker.then(tileFunctions => tileFunctions.init(
      this.uid, dataConfig.url, dataConfig.chromSizesUrl
    ).then(() => this.worker));
  }

  tilesetInfo(callback) {
    this.worker.then((tileFunctions) => {
      tileFunctions.tilesetInfo(this.uid).then(
        callback
      );
    });
  }

  fetchTilesDebounced(receivedTiles, tileIds) {
    this.worker.then((tileFunctions) => {
      tileFunctions.fetchTilesDebounced(
        this.uid, tileIds
      ).then(receivedTiles);
    });
  }
}

export default BAMDataFetcher;
