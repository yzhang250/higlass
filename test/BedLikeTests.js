/* eslint-env node, jasmine, mocha */
import {
  configure
  // render,
} from 'enzyme';

import Adapter from 'enzyme-adapter-react-16';

import { expect } from 'chai';

// Utils
import {
  waitForTilesLoaded,
  mountHGComponent,
  removeHGComponent,
  getTrackObjectFromHGC
} from '../app/scripts/utils';

configure({ adapter: new Adapter() });

describe('BedLikeTrack |', () => {
  let hgc = null;
  let div = null;

  describe('vertical scaling', () => {
    beforeAll(done => {
      [div, hgc] = mountHGComponent(div, hgc, viewConf1, done);
    });

    it('Zooms vertically', () => {
      const trackObj = getTrackObjectFromHGC(hgc.instance(), 'aa', 'a');

      // because we're loading tiles synchronously, they'll be loaded
      // before the higlass component finishes measuring its size
      // so we need to block the rerender call to see the effect
      // of our zoomedY function
      trackObj.rerender = () => {};

      waitForTilesLoaded(hgc.instance(), () => {
        trackObj.zoomedY(100, 0.8);
        expect(trackObj.fetchedTiles['0.0'].rectGraphics.scale.y).to.eql(1.25);
      });
    });

    afterAll(() => {
      removeHGComponent(div);
      div = null;
      hgc = null;
    });
  });

  describe('Normal tests', () => {
    beforeAll(done => {
      [div, hgc] = mountHGComponent(div, hgc, viewConf, done);
    });

    it('Ensures that the track was rendered', () => {
      expect(hgc.instance().state.viewConfig.editable).to.eql(true);
      const trackObj = getTrackObjectFromHGC(
        hgc.instance(),
        viewConf.views[0].uid,
        viewConf.views[0].tracks.top[0].uid
      );

      expect(Object.keys(trackObj.drawnRects).length).to.be.above(0);
    });

    it('Checks that + and - strand entries are at different heights', () => {
      const trackObj = getTrackObjectFromHGC(
        hgc.instance(),
        viewConf.views[0].uid,
        viewConf.views[0].tracks.top[0].uid
      );

      const rectHeights = new Set();
      for (const tileId in trackObj.drawnRects) {
        for (const uid in trackObj.drawnRects[tileId]) {
          const rect = trackObj.drawnRects[tileId][uid];

          rectHeights.add(rect[0][3]);
        }
      }

      expect(rectHeights.size).to.eql(2);
    });

    it('Exports to SVG', () => {
      const svgText = hgc.instance().createSVGString();

      const textIx = svgText.indexOf('text');
      const greenIx = svgText.indexOf('green');

      expect(textIx).to.be.above(0);
      expect(greenIx).to.be.below(0);
    });

    it('Checks minusStrandColor', done => {
      hgc.instance().state.views.aa.tracks.top[0].options.minusStrandColor =
        'green';

      hgc.setState(hgc.instance().state);
      hgc.update();

      const svgText = hgc.instance().createSVGString();
      const greenIx = svgText.indexOf('green');

      expect(greenIx).to.be.above(0);
      done();
    });

    it('Checks segment polygons', done => {
      hgc.instance().state.views.aa.tracks.top[0].options.annotationStyle =
        'segment';

      hgc.setState(hgc.instance().state);
      hgc.update();

      const trackObj = getTrackObjectFromHGC(
        hgc.instance(),
        viewConf.views[0].uid,
        viewConf.views[0].tracks.top[0].uid
      );

      for (const tileId in trackObj.drawnRects) {
        for (const uid in trackObj.drawnRects[tileId]) {
          const rect = trackObj.drawnRects[tileId][uid];

          // the segment polygons have 12 vertices
          expect(rect[0].length).to.eql(24);
        }
      }

      done();
    });

    it('Checks to make sure that scaled height changes the height of drawn rects', () => {
      // const currentHeight =
      const trackObj = getTrackObjectFromHGC(
        hgc.instance(),
        viewConf.views[0].uid,
        viewConf.views[0].tracks.top[0].uid
      );

      let drawnRects = Object.values(trackObj.drawnRects[13])[0][0];
      const prevHeight = drawnRects[5] - drawnRects[3];

      // switch to scaled height
      hgc.instance().state.views.aa.tracks.top[0].options.annotationHeight =
        'scaled';

      hgc.setState(hgc.instance().state);
      hgc.update();

      drawnRects = Object.values(trackObj.drawnRects[13])[0][0];
      const nextHeight = drawnRects[5] - drawnRects[3];

      // make sure the height of the drawn rects actually changed
      expect(nextHeight).to.not.eql(prevHeight);

      // switch back to the original height
      hgc.instance().state.views.aa.tracks.top[0].options.annotationHeight = 8;

      hgc.setState(hgc.instance().state);
      hgc.update();

      drawnRects = Object.values(trackObj.drawnRects[13])[0][0];
      const finalHeight = drawnRects[5] - drawnRects[3];

      expect(finalHeight).to.eql(prevHeight);

      // set the maximum annotation height
      //
      hgc.instance().state.views.aa.tracks.top[0].options.maxAnnotationHeight = 8;
      hgc.instance().state.views.aa.tracks.top[0].options.annotationHeight =
        'scaled';

      hgc.setState(hgc.instance().state);
      hgc.update();

      drawnRects = Object.values(trackObj.drawnRects[13])[0][0];
      const finalestHeight = drawnRects[5] - drawnRects[3];

      expect(finalestHeight).to.eql(prevHeight);
    });

    it('Checks to make sure font size increases', () => {
      const trackObj = getTrackObjectFromHGC(
        hgc.instance(),
        viewConf.views[0].uid,
        viewConf.views[0].tracks.top[0].uid
      );

      const prevHeight = Object.values(trackObj.fetchedTiles)[0].textHeights
        .CTCF_known1;
      hgc.instance().state.views.aa.tracks.top[0].options.fontSize = 20;

      hgc.setState(hgc.instance().state);
      hgc.update();

      const newHeight = Object.values(trackObj.fetchedTiles)[0].textHeights
        .CTCF_known1;

      expect(newHeight).to.be.above(prevHeight);
    });

    it('Changes the color encoding of the annotations', () => {
      hgc.instance().state.views.aa.tracks.top[0].options.colorEncoding = 5;

      hgc.setState(hgc.instance().state);
      hgc.update();

      const svgString = hgc.instance().createSVGString();

      expect(svgString.indexOf('rgba(252,186,144,255)')).to.be.above(1);
    });

    it('Zooms in and ensures that rectangles are rerendered', () => {
      const { trackRenderer } = hgc.instance().tiledPlots.aa;
      const trackObj = getTrackObjectFromHGC(
        hgc.instance(),
        viewConf.views[0].uid,
        viewConf.views[0].tracks.top[0].uid
      );

      const tile = Object.values(trackObj.fetchedTiles)[0];
      const scaleWidth =
        tile.drawnAtScale.domain()[1] - tile.drawnAtScale.domain()[0];

      trackRenderer.zoomToDataPos(
        1585600000,
        1585800000,
        1585600000,
        1585800000,
        0
      );

      const newScaleWidth =
        tile.drawnAtScale.domain()[1] - tile.drawnAtScale.domain()[0];

      expect(newScaleWidth).to.be.below(scaleWidth);
    });

    afterAll(() => {
      removeHGComponent(div);
    });
  });

  const viewConf = {
    editable: true,
    zoomFixed: false,
    trackSourceServers: ['http://higlass.io/api/v1'],
    exportViewUrl: 'http://higlass.io/api/v1/viewconfs/',
    views: [
      {
        uid: 'aa',
        initialXDomain: [1585110207.2930722, 1586490384.5429244],
        initialYDomain: [1187975248.2421436, 1187975248.2421436],
        autocompleteSource:
          'http://higlass.io/api/v1/suggest/?d=OHJakQICQD6gTD7skx4EWA&',
        genomePositionSearchBoxVisible: false,
        chromInfoPath: '//s3.amazonaws.com/pkerp/data/hg19/chromSizes.tsv',
        tracks: {
          top: [
            {
              uid: 'a',
              type: 'bedlike',
              data: {
                type: 'local-tiles',
                tilesetInfo: {
                  N3g_OsVITeulp6cUs2EaJA: {
                    zoom_step: 1,
                    max_length: 3137161265,
                    assembly: 'hg19',
                    chrom_names:
                      'chr1\tchr2\tchr3\tchr4\tchr5\tchr6\tchr7\tchr8\tchr9\tchr10\tchr11\tchr12\tchr13\tchr14\tchr15\tchr16\tchr17\tchr18\tchr19\tchr20\tchr21\tchr22\tchrX\tchrY\tchrM\tchr6_ssto_hap7\tchr6_mcf_hap5\tchr6_cox_hap2\tchr6_mann_hap4\tchr6_apd_hap1\tchr6_qbl_hap6\tchr6_dbb_hap3\tchr17_ctg5_hap1\tchr4_ctg9_hap1\tchr1_gl000192_random\tchrUn_gl000225\tchr4_gl000194_random\tchr4_gl000193_random\tchr9_gl000200_random\tchrUn_gl000222\tchrUn_gl000212\tchr7_gl000195_random\tchrUn_gl000223\tchrUn_gl000224\tchrUn_gl000219\tchr17_gl000205_random\tchrUn_gl000215\tchrUn_gl000216\tchrUn_gl000217\tchr9_gl000199_random\tchrUn_gl000211\tchrUn_gl000213\tchrUn_gl000220\tchrUn_gl000218\tchr19_gl000209_random\tchrUn_gl000221\tchrUn_gl000214\tchrUn_gl000228\tchrUn_gl000227\tchr1_gl000191_random\tchr19_gl000208_random\tchr9_gl000198_random\tchr17_gl000204_random\tchrUn_gl000233\tchrUn_gl000237\tchrUn_gl000230\tchrUn_gl000242\tchrUn_gl000243\tchrUn_gl000241\tchrUn_gl000236\tchrUn_gl000240\tchr17_gl000206_random\tchrUn_gl000232\tchrUn_gl000234\tchr11_gl000202_random\tchrUn_gl000238\tchrUn_gl000244\tchrUn_gl000248\tchr8_gl000196_random\tchrUn_gl000249\tchrUn_gl000246\tchr17_gl000203_random\tchr8_gl000197_random\tchrUn_gl000245\tchrUn_gl000247\tchr9_gl000201_random\tchrUn_gl000235\tchrUn_gl000239\tchr21_gl000210_random\tchrUn_gl000231\tchrUn_gl000229\tchrUn_gl000226\tchr18_gl000207_random',
                    chrom_sizes:
                      '249250621\t243199373\t198022430\t191154276\t180915260\t171115067\t159138663\t146364022\t141213431\t135534747\t135006516\t133851895\t115169878\t107349540\t102531392\t90354753\t81195210\t78077248\t59128983\t63025520\t48129895\t51304566\t155270560\t59373566\t16571\t4928567\t4833398\t4795371\t4683263\t4622290\t4611984\t4610396\t1680828\t590426\t547496\t211173\t191469\t189789\t187035\t186861\t186858\t182896\t180455\t179693\t179198\t174588\t172545\t172294\t172149\t169874\t166566\t164239\t161802\t161147\t159169\t155397\t137718\t129120\t128374\t106433\t92689\t90085\t81310\t45941\t45867\t43691\t43523\t43341\t42152\t41934\t41933\t41001\t40652\t40531\t40103\t39939\t39929\t39786\t38914\t38502\t38154\t37498\t37175\t36651\t36422\t36148\t34474\t33824\t27682\t27386\t19913\t15008\t4262',
                    tile_size: 1024.0,
                    max_zoom: 22,
                    max_width: 4294967296.0,
                    min_pos: [1],
                    max_pos: [3137161265],
                    header: 'chrom\tstart\tend\tname\tscore\tstrand',
                    name: 'CTCF motifs (hg19)',
                    datatype: 'bedlike',
                    coordSystem: 'hg19',
                    coordSystem2: ''
                  }
                },
                tiles: {
                  'N3g_OsVITeulp6cUs2EaJA.13.3025': [
                    {
                      xStart: 1586021696,
                      xEnd: 1586021714,
                      chrOffset: 1539159712,
                      importance: 0.46588283776257966,
                      uid: 'HlwPzrlVTjeApADYR2t9KA',
                      fields: [
                        'chr9',
                        '46861984',
                        '46862002',
                        'CTCF_known1',
                        '1',
                        '+'
                      ]
                    },
                    {
                      xStart: 1586024622,
                      xEnd: 1586024640,
                      chrOffset: 1539159712,
                      importance: 0.9996493250284274,
                      uid: 'ZXo77lvHRk2-ibX8U2RiPg',
                      fields: [
                        'chr9',
                        '46864910',
                        '46864928',
                        'CTCF_known1',
                        '2',
                        '-'
                      ]
                    },
                    {
                      xStart: 1586342860,
                      xEnd: 1586342878,
                      chrOffset: 1539159712,
                      importance: 0.8126231801962215,
                      uid: 'ZD0zPgz_SOWvyr46kTO3Mg',
                      fields: [
                        'chr9',
                        '47183148',
                        '47183166',
                        'CTCF_known1',
                        '3',
                        '+'
                      ]
                    },
                    {
                      xStart: 1586348254,
                      xEnd: 1586348272,
                      chrOffset: 1539159712,
                      importance: 0.0014597373104586753,
                      uid: 'dmuByv3UR62F2D1RR2Gj0g',
                      fields: [
                        'chr9',
                        '47188542',
                        '47188560',
                        'CTCF_known1',
                        '4',
                        '+'
                      ]
                    }
                  ],
                  'N3g_OsVITeulp6cUs2EaJA.13.3024': [
                    {
                      xStart: 1585517474,
                      xEnd: 1585517492,
                      chrOffset: 1539159712,
                      importance: 0.6445142705295743,
                      uid: 'XKlcy3_fQWarmUBowuhLlA',
                      fields: [
                        'chr9',
                        '46357762',
                        '46357780',
                        'CTCF_known1',
                        '5',
                        '+'
                      ]
                    },
                    {
                      xStart: 1585733113,
                      xEnd: 1585733131,
                      chrOffset: 1539159712,
                      importance: 0.4212542960422452,
                      uid: 'MTLDLgnqRuGD-d53dDSKBA',
                      fields: [
                        'chr9',
                        '46573401',
                        '46573419',
                        'CTCF_known1',
                        '6',
                        '-'
                      ]
                    },
                    {
                      xStart: 1585894153,
                      xEnd: 1585894171,
                      chrOffset: 1539159712,
                      importance: 0.7207326474637893,
                      uid: 'azXG4x4XQWKP5G04L7rxWQ',
                      fields: [
                        'chr9',
                        '46734441',
                        '46734459',
                        'CTCF_known1',
                        '7',
                        '+'
                      ]
                    },
                    {
                      xStart: 1585957049,
                      xEnd: 1585957067,
                      chrOffset: 1539159712,
                      importance: 0.8737239911419236,
                      uid: 'GLKOmA_7Q8uLnavGYuvPrg',
                      fields: [
                        'chr9',
                        '46797337',
                        '46797355',
                        'CTCF_known1',
                        '8',
                        '-'
                      ]
                    }
                  ],
                  'N3g_OsVITeulp6cUs2EaJA.13.3023': [
                    {
                      xStart: 1585104697,
                      xEnd: 1585104715,
                      chrOffset: 1539159712,
                      importance: 0.46201545819118106,
                      uid: 'EeJ32K0ZRZOWBwEZbxHDGQ',
                      fields: [
                        'chr9',
                        '45944985',
                        '45945003',
                        'CTCF_known1',
                        '9',
                        '-'
                      ]
                    },
                    {
                      xStart: 1585306193,
                      xEnd: 1585306211,
                      chrOffset: 1539159712,
                      importance: 0.881573058229644,
                      uid: 'JPlhrDCKSVKKIDWpeNBbpg',
                      fields: [
                        'chr9',
                        '46146481',
                        '46146499',
                        'CTCF_known1',
                        '10',
                        '-'
                      ]
                    },
                    {
                      xStart: 1585430470,
                      xEnd: 1585430488,
                      chrOffset: 1539159712,
                      importance: 0.3771482287523691,
                      uid: 'dSEc_p9TSJCgZY-mQjF_Uw',
                      fields: [
                        'chr9',
                        '46270758',
                        '46270776',
                        'CTCF_known1',
                        '11',
                        '-'
                      ]
                    },
                    {
                      xStart: 1585440016,
                      xEnd: 1585440034,
                      chrOffset: 1539159712,
                      importance: 0.4396973618791794,
                      uid: 'OiTeK6uBRqynwTLpXIQvYA',
                      fields: [
                        'chr9',
                        '46280304',
                        '46280322',
                        'CTCF_known1',
                        '12',
                        '-'
                      ]
                    }
                  ]
                }
              },
              height: 80,
              options: {
                alternating: false,
                annotationHeight: 8,
                fillColor: 'blue',
                axisPositionHorizontal: 'right',
                labelColor: 'black',
                labelPosition: 'hidden',
                labelLeftMargin: 0,
                labelRightMargin: 0,
                labelTopMargin: 0,
                labelBottomMargin: 0,
                minHeight: 20,
                trackBorderWidth: 0,
                trackBorderColor: 'black',
                valueColumn: null,
                colorEncoding: false,
                showTexts: true,
                colorRange: [
                  '#000000',
                  '#652537',
                  '#bf5458',
                  '#fba273',
                  '#ffffe0'
                ],
                colorEncodingRange: false,
                name: 'CTCF motifs (hg19)'
              }
            },
            { type: 'top-axis' }
          ],
          left: [],
          center: [],
          right: [],
          bottom: [],
          whole: [],
          gallery: []
        },
        layout: {
          w: 12,
          h: 3,
          x: 0,
          y: 0,
          moved: false,
          static: false
        },
        genomePositionSearchBox: {
          autocompleteServer: 'http://higlass.io/api/v1',
          chromInfoServer: 'http://higlass.io/api/v1',
          visible: true,
          chromInfoId: 'hg19',
          autocompleteId: 'OHJakQICQD6gTD7skx4EWA'
        }
      }
    ],
    zoomLocks: {
      locksByViewUid: {},
      locksDict: {}
    },
    locationLocks: {
      locksByViewUid: {},
      locksDict: {}
    },
    valueScaleLocks: {
      locksByViewUid: {},
      locksDict: {}
    }
  };
});

const viewConf1 = {
  editable: true,
  zoomFixed: false,
  trackSourceServers: [],
  views: [
    {
      uid: 'aa',
      tracks: {
        top: [
          {
            uid: 'dnQAEksiRnC2bBOKcL9JxQ',
            type: 'top-axis',
            height: 20,
            options: {}
          },
          {
            type: 'bedlike',
            data: {
              type: 'local-tiles',
              tilesetInfo: {
                'x.0.0': {
                  max_width: 31960,
                  max_zoom: 0,
                  min_pos: [0],
                  max_pos: [31960],
                  header: 'contig\tstart\tend\tname\tscore'
                }
              },
              tiles: {
                'x.0.0': [
                  {
                    uid: 'd49f9a05-b39e-4a85-aae5-e0141793da1f',
                    xStart: 17271,
                    xEnd: 17667,
                    chrOffset: 0,
                    fields: ['chr', 17271, 17667, 'annotation 1', '39.7'],
                    importance: 0.9744638120748439
                  },
                  {
                    uid: '684910d4-cd37-48da-bc23-5862bc6ef5ce',
                    xStart: 17364,
                    xEnd: 17664,
                    chrOffset: 0,
                    fields: ['chr', 17364, 17664, 'annotation 2', '59.1'],
                    importance: 0.8423332345173808
                  },
                  {
                    uid: 'e1b1cdb4-68e9-4902-bd2c-3a26bdeedffe',
                    xStart: 17364,
                    xEnd: 17658,
                    chrOffset: 0,
                    fields: ['chr', 17364, 17658, 'annotation 3', '27.9'],
                    importance: 0.1704252983722232
                  },
                  {
                    uid: '25825d76-a44e-462b-b58a-c35606871982',
                    xStart: 17295,
                    xEnd: 17811,
                    chrOffset: 0,
                    fields: ['chr', 17295, 17811, 'annotation 4', '25.6'],
                    importance: 0.4054893980746901
                  },
                  {
                    uid: '74b86f58-797e-4316-b455-c88cf8e94e5c',
                    xStart: 17361,
                    xEnd: 17652,
                    chrOffset: 0,
                    fields: ['chr', 17361, 17652, 'annotation 5', '57.2'],
                    importance: 0.08369855257430192
                  },
                  {
                    uid: '84e5efca-ff53-4368-b61e-59d28de23124',
                    xStart: 17355,
                    xEnd: 17673,
                    chrOffset: 0,
                    fields: ['chr', 17355, 17673, 'annotation 6', '43.7'],
                    importance: 0.4723622846939204
                  },
                  {
                    uid: '3fc063d9-4688-4226-9512-a980b650d0c1',
                    xStart: 17346,
                    xEnd: 17664,
                    chrOffset: 0,
                    fields: ['chr', 17346, 17664, 'annotation 7', '14.2'],
                    importance: 0.16589513792465693
                  },
                  {
                    uid: '3fdd9178-ba4e-4ff1-99ad-85480e3d4821',
                    xStart: 17310,
                    xEnd: 17664,
                    chrOffset: 0,
                    fields: ['chr', 17310, 17664, 'annotation 8', '14.2'],
                    importance: 0.469265480855537
                  },
                  {
                    uid: 'eb2b731e-e767-4e35-b4d0-fce396bb0244',
                    xStart: 17343,
                    xEnd: 17664,
                    chrOffset: 0,
                    fields: ['chr', 17343, 17664, 'annotation 9', '34.7'],
                    importance: 0.5706965626465064
                  }
                ]
              }
            },
            height: 297,
            options: {
              annotationHeight: 'scaled',
              fontSize: 8,
              name: 'PFAM Domains',
              labelPosition: 'bottomRight',
              labelColor: 'grey',
              alternating: false,
              annotationStyle: 'box',
              fillColor: 'blue',
              axisPositionHorizontal: 'right',
              labelLeftMargin: 0,
              labelRightMargin: 0,
              labelTopMargin: 0,
              labelBottomMargin: 0,
              minHeight: 20,
              maxAnnotationHeight: 10,
              maxTexts: 1000,
              trackBorderWidth: 0,
              trackBorderColor: 'black',
              valueColumn: null,
              showTexts: true,
              colorRange: [
                '#000000',
                '#652537',
                '#bf5458',
                '#fba273',
                '#ffffe0'
              ],
              colorEncodingRange: false,
              colorEncoding: false
            },
            uid: 'a',
            width: 470
          }
        ],
        center: [],
        left: [],
        right: [],
        bottom: [],
        whole: [],
        gallery: []
      },
      layout: {
        w: 12,
        h: 11,
        x: 0,
        y: 0,
        moved: false,
        static: false
      },
      overlays: [
        {
          uid: 'G_Hmq9SGTSiNlsPALm5q7w',
          includes: ['dnQAEksiRnC2bBOKcL9JxQ', 'buz51Tn0T_-ZN4mbtGV4VQ'],
          options: {
            extent: [[18579, 20027]],
            orientationsAndPositions: [
              {
                orientation: '1d-horizontal',
                position: {
                  left: 0,
                  top: 0,
                  width: 470,
                  height: 20
                }
              }
            ]
          },
          fillColor: 'blue'
        }
      ],
      initialXDomain: [16675.657112593486, 18105.83589286811],
      initialYDomain: [-9116.921165661633, -8900.872881832913]
    }
  ],
  zoomLocks: {
    locksByViewUid: {},
    locksDict: {}
  },
  locationLocks: {
    locksByViewUid: {},
    locksDict: {}
  },
  valueScaleLocks: {
    locksByViewUid: {},
    locksDict: {}
  }
};
