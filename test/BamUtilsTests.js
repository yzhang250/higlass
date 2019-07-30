/* eslint-env node, jasmine */
import { expect } from 'chai';
import parseMD from '../app/scripts/utils/bam-utils.js';

describe('Bam utils', () => {
  it('should parse MD strings', (done) => {
    const string1 = '4T95T200';

    const res = parseMD(string1);

    expect(res).to.not.eql(undefined);
    expect(res[0].pos).to.eql(5);
    expect(res[0].base).to.eql('T');
    expect(res[1].pos).to.eql(101);
    expect(res[1].base).to.eql('T');
    done();
  });
});
