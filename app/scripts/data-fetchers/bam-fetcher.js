import slugid from 'slugid';
import { BamFile } from '@gmod/bam';
import ChromosomeInfo from '../ChromosomeInfo';
import { spawn, Thread, Worker } from 'threads';


class BAMDataFetcher {
  constructor(dataConfig) {
    this.dataConfig = dataConfig;
    this.uid = slugid.nice();

    this.worker = spawn(
      new Worker('./bam-fetcher-worker.js')
    );

    this.initPromise = this.worker.then((tileFunctions) => {
      console.log('tileFunctions:', tileFunctions);
    
      return tileFunctions.init(
        this.uid, dataConfig.url, dataConfig.chromSizesUrl
      ).then(() => this.worker);
    });

    console.log('constructor');
  }

  tilesetInfo(callback) {
    console.log('tsi');
    this.worker.then((tileFunctions) => {
      tileFunctions.tilesetInfo(this.uid).then(
        callback
      );
    });
  }

  fetchTilesDebounced(receivedTiles, tileIds) {
    console.log('ftd', tileIds);
    this.worker.then((tileFunctions) => {
      tileFunctions.fetchTilesDebounced(
        this.uid, tileIds
      ).then(receivedTiles);
    });
  }
}

export default BAMDataFetcher;
