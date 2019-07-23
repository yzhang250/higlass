import GBKDataFetcher from './genbank-fetcher';
import BAMDataFetcher from './bam-fetcher';
import DataFetcher from '../DataFetcher';

const getDataFetcher = (dataConfig, pubSub) => {
  if (dataConfig.type === 'genbank') {
    return new GBKDataFetcher(dataConfig, pubSub);
  }
  if (dataConfig.type === 'bam') {
    return new BAMDataFetcher(dataConfig, pubSub);
  }

  return new DataFetcher(dataConfig, pubSub);
};

export default getDataFetcher;
