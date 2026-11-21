// gap3.js: items the feature audit listed as "not built" and that turned out to be implementable in plain JS, no libraries, no network.
// PDF417 generator, image tracer (posterise + contour trace), Outlook .msg viewer, Arrow IPC decoder, GeoTIFF viewer, TrueType subsetter,
// PSD layer viewer/flattener, licence compatibility matrix, quotation generator. Each was verified against an independent oracle
// (zxing-cpp, extract-msg, pyarrow, tifffile/rasterio, fontTools, psd-tools); the limits of each are stated in the tool output and its content page.
// Pure functions are named exports so a Node check can run them; DOM-only parts (canvas decode, custom UI) are isolated.

const D = [];
export default D;

const DOCS = 'Documents', IMGC = 'Images', GENC = 'Generators';
const need = (t, what = 'input') => { if (t == null || !String(t).trim()) throw new Error('Enter ' + what + ' first.'); return String(t); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, a, b) => Math.max(a, Math.min(b, Number.isFinite(+n) ? +n : a));
const u8of = async (f) => new Uint8Array(await f.arrayBuffer());
const table = (head, rows) => {
  const all = [head, ...rows].map((r) => r.map((c) => String(c ?? '')));
  const w = head.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  return all.map((r) => r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd()).join('\n');
};

// =====================================================================================================
// PDF417 (ISO/IEC 15438). Compaction: text (4 sub-modes), byte, numeric; Reed-Solomon over GF(929), ECC level 0-8.
// The three 929-entry cluster tables are the standard's symbol tables (they are not derivable by a formula: the standard picks
// 929 of ~1150 candidate bar patterns per cluster in a fixed order), stored as base-36, 4 characters per 17-module pattern.
// Verified: every codeword 0-928 in every cluster round-trips through zxing-cpp (see report in the content page).
// Skipped: macro PDF417, GS1 / function codewords, Compact PDF417 (truncated), automatic mode optimisation (greedy segmentation).
// =====================================================================================================
const P417_TBL = '2ksg2oz42r242km82ovs2r0e2bwg2kj42bts1uf42bsg1ue82cw02l0w2p302cps2kxk2p1a1w3k2cmo1w0w1x342d4g2l4s1www2d142l321wts2czg1xbk2d8c1x882d6m1xfg2r5m2k802ooo2qwu2b402k4w2on02b1c2k3c1su82b002k2k1stc2azc1ssw2bj42kc82oqm1tq82bg02kak1tnk2beg2k9q1tm82bdo1u5c2bnc2ke61u282blo1u0o2bku1u9k2bpa1u7w1u722aps2jxs2ojg2an42jw82oim1s1s2als2jvg1s0w2al41s0g1s081sjk2auo2jzw1sgw2at42jz21sfk2asc1sew1sek1sog2aws1smw2avy1sm41sqk2ag02jso2ogu1rnk2aeo2jrw1rmo2ae02jri1rm82ado1rm02adi1rvk2aig2jtq1ru82aho1rtk2aha1rt81rt22aji1rwu1rgg2ab42jq41rfk2aag2jpq1rf42aa41rew2a9y1res1rjk1riw1rik1rc02jou2a8c2a861rb62in42nw82qim27y82ik02nuk27vk2iig2ntq1mio27u81mhs28dc2irc2ny61neo28a82ipo1nc0288o1nao1na01nts28hk2ita1nqo28fw1np41noc1ny028ji1nwc1nzy2ls02pgw2rb02lpc2pfc2ra62e682lo02pek2e5c2lnc2pe62e4w2ln027k02icw2nr02eo027hc2ibc2nq62elc2lvc2pi61zy81lpc27fc2ia61zxc2ejc1zww1m8027ow2if020g01m5c27nc2ie620dc2erc2ly620c01m3c20bc1mcw27r020kw1mbc27q620jc2eu620ik1mf020n01me620m62li82pbs2r8e2ds02lgw2pb02dr42lg82pam2dqo2lfw2dqg2dqc27a82i7s2noe2e00278w2i701yrk1lb42ljw2i6m1yqo1lao277w1yq82dxo277q1lac1lk027co2i8u1yzk1lio27bw1yy82e1o27bi1yxk1lho1lhi1lmg27dq1z201llo1z181lla1z0u1z322dkw2ldc2p982dk02lco2p8u2djk2lcc2djc2lc62dj82dj61l4w275c2i581y681l40274o2i4u1y5c2dnc2le61y4w1l3c27461y4o2dmu1y4k1l80276k1y9c1l7c27661y8o2dou1y8c1l6u1y861yak1ya62dgg2law2p7y2dg02lak2dfs2lae2dfo2dfm1l0g272w2i3y1xuo1l00272k1xu82dho272e1xu01kzo1xtw1kzm1l201xw81xvw1xvq2l9o2l9i2ddu271o1ky01xoo1xok1xoi25z42hkg2ncs25wg2hiw1ikg25v42hi41ijk25ug1ij41iiw1j2826402hmk1izk262g2hlq1iy8261o1ixk1ix81j7426641j5k265a1j4s1j981j8e2j4w2o542qn2291c2j3k2o4c290g2j2w2o3y29002j2k28zs2j2e25pc2hfc2na6299c25o02hek1pa81i5c2j6k2he61p9c297c25n01p8w1i4o1p8o1ie825rs2hge1pi81icw2j8e1pgw29b025qm1pg81ibw1pfw1igo25su1pko1ifw1pjw1ifi1ihq1plq2m9s2pps2rfg2m8w2pp42rf22m8g2pos2m882pom2m8428u82j002o2k2fk028tc2pr02o262fj42mc82pqm2fio28so2iyu2fig2mbq28si1hz425kg2hcs1oow1hy825js2hce224g1oo028wo2j0u223k2fmg2mdq25ja22341onc28w6222w1hxe1i2825lo1os01i1k25la227k1orc28y6226w2fny1i121oqu1i3g1ot81i32228s1osu2m5c2pnc2re62m4w2pn02m4o2pmu2m4k2m4i28ps2ixk2o1a2f8g28pc2pny2f802m6k2ix22f7s28p02f7o28oy2f7m1huo25i02hbi1odc1hu825ho21eo1ocw28r025hi21e82f9o1htw21e01ock1htu1oci1hw825im1oew1hvw21g81oek1hvq21fw1oee1hwu21gu2m342pm42m2w2ply2m2s2m2q28nk2iwc2f2o28nc2iw62f2g2m3q2f2c28n62f2a1hsg25gs1o7k1hs825gm211s1o7c28o6211k2f3a1hs2211g1o76211e1o8c212k212e2pli2m1u2ivq28mc28ma1hrc1o4o20vc1hr61o4i24ww1glc24vk1gkg24uw2gzy1gk024uk1gjs24ue1gtc24zc2h261gs024yk1grc24y61gr01gqu1gvs250e1gv01gum1gwu26gw2htc2nh826g02hso26fk2hsc26fc2hs626f81ge824s02gyk1jy81gdc2huk2gy61jxc26jc2hu61jww1gco24qu1jwo26iu1gci1ghc24t81k1c1ggo24su1k0o26ku1k0c1gg61gik1k2k1gi61k262jds2o9k2qpa2jdc2o982jd42o922jd02jcy26cg2hqw29pc26c02hqk29ow2jf02hqe29oo26bo29ok26bm29oi1g9s24pk1jmo1g9c2hri1qcg1jm826do24p21qc029qk1g901qbs1jlw1g8y1jlu1gbc24q61jo81gb01qe01jnw1gau1qdo1jnq1gby1jou1qem2pu82rho2pu02rhi2ptw2ptu2jbk2o8c2mkw2pv02o862mko2puu2mkk2jb62mki26a82hpo29jk26a02hpi2g2829jc2jc62g202mli269u2g1w29j62g1u1g7k24oc1jgw1g7c24o61pzk1jgo26au230w1pzc29k61g76230o2g2u1jgi230k1g8c1jho1g861q0c1jhi231o1q06231i2pt42rh22pt02psy2jag2o7q2mi02pti2mhw2jaa2mhu26942hp229go26902fvs29gk268y2fvo29gi2fvm1g6g24nq1je0269i1pt41jdw1g6a22nc1pt01jdu22n81psy22n61jee22nq2psi2mgk2mgi29f82fsk2fsi1jck1ppw22gk22gi1fls1fkw24d41fkg1fk81fk41fow1fo81fnw1fnq1fq41fpq255s255c2h5825542h522550254y1fhc24bc1h9c257c24b01h8w25701h8o256u1h8k1fgi1h8i1fiw24by1haw257y1hak1fie1hae1fji1hbi2hxs2hxk2hxg2hxe253k26s02hyk2h4626rs2hye26ro253626rm1ff41h3k1few249y1kgg1h3c1fes1kg81h381feq1kg41h361ffw1h4c1ffq1kh81h461kh22obs2obo2obm2hwo2jjc2oc62jj82hwi2jj6252g2h3q26p42hx229yg26p0252a29yc26oy29ya1fe0249i1h0o252u1ka01h0k1fdu1qso1k9w1h0i1qsk1k9u1fee1h121kae1qt22ris2riq2ob82px02ob62pwy2hw42jhw2hw22mpg2jhu2mpe251w26no251u29v826nm2gac2r1c2s3c2ou82r002s2k2otc2qzc2s262osw2qz02oso2qyu2osk2p282r3s2s4e2kw02p0w2r302kv42p082r2m2kuo2ozw2kug2ozq2kuc2l402p4o2r4u2czk2l2o2p3w2cyo2l202p3i2cy82l1o2cy02l1i2cxw2d7k2l6g2p5q1x6o2d682l5o1x5s2d5k2l5a1x5c2d581x542d521xeo2da02l7i1xdc2d981xco2d8u1xcc1xh42db21xgc1xfy2on42qwg2s0s2om82qvs2s0e2ols2qvg2olk2qva2olg2ole2kao2oq82qxo2k9s2opk2qxa2k9c2op82k942op22k902k8y2bls2kds2org2bkw2kd42or22bkg2kcs2bk82kcm2bk42bk21u802bow2kf01u742bo82kem1u6o2bnw1u6g2bnq1u6c1ub42bq41uag2bpq1ua41u9y1ucc1uby2oio2qu02rzi2oi82qto2oi02qti2ohw2ohu2jz42ok82qum2jyo2ojw2jyg2ojq2jyc2jya2aw02k0o2oku2avk2k0c2avc2k062av82av61sps2axk2k1a1spc2ax81sp42ax21sp01soy1src2ay61sr01squ1sry2ogg2qss2og82qsm2og42og22jtc2oh82jt42oh22jt02jsy2aj42ju42aiw2jty2ais2aiq1ryo2ajw1ryg2ajq1ryc1rya1rzg1rza2ofc2qs62of82of62jqg2ofq2jqc2jqa2aco2jqu2ack2aci1rl42ad21rl01rky2oes2oeq2jp02joy2a9g2a9e2nuo2qi82rto2nts2qhk2rta2ntc2qh82nt42qh22nt02nsy2ips2nxs2qjg2iow2nx42qj22iog2nws2io82nwm2io42io228g02isw2nz028f42is82nym28eo2irw28eg2irq28ec28ea1nwg28j42iu41nvk28ig2itq1nv428i41nuw28hy1nus1nzk28kc1nyw28jy1nyk1nye1o0s1o0e2ra82s7s1zw02r9s2s7g1zi02r9k2s7a1zb02r9g2r9e2nq82qfs2rse2pi82nps2s8e2phs2rbg2qfa2phk2npg2phg2npe2phe2ie82nrs2qge2ly82ids2nrg2lxs2pjg2nra2lxk2idg2lxg2ide2lxe27q82ifs2nse2eu827ps2ifg2ets2lzg2ifa2etk27pg2etg27pe2ete1me827rs2ige20m81mds27rg20ls2evg27ra20lk1mdg20lg1mde1mfs27se20ns1mfg20ng1mfa20na1mge2r802s6k1ypk2r7s2s6e1yik2r7o1yf22r7m2no02qek2pcg2nns2qee2pc82r8m2pc42nnm2pc22i8g2nos2llc2i882nom2ll42pd22ll02i822lky27dc2i982e3427d42i922e2w2lly2e2s27cy2e2q1ln427e41z2o1lmw27dy1z2g2e3q1z2c1lmq1z2a1lnw1z3g1lnq1z3a2r6w2s5y1y4c2r6s1y0u2r6q2nmw2qdy2p9k2r7a2p9g2nmq2p9e2i5k2nna2lew2i5g2les2i5e2leq276w2i5y2dpk2lfa2dpg276q2dpe1l9k277a1yaw1l9g1yas1l9e1yaq1l9y1yba2r6c1xtq2r6a2nmc2p842nma2p822i442lbo2i422lbm273o2dis273m2diq1l2s1xx01l2q1xwy2r622nm22p7e2i3e2la227222dfe2nc02q8o2rou2nbk2q8c2nbc2q862nb82nb62hls2ndk2q9a2hlc2nd82hl42nd22hl02hky265c2hnc2ne6264w2hn0264o2hmu264k264i1j8g266w2hny1j80266k1j7s266e1j7o1j7m1ja0267i1j9o1j9i1jam2qmo2rvw1p882qmg2rvq1p182qmc1oxq2qma2n9s2q7g2o5s2n9k2q7a2o5k2qna2o5g2n9e2o5e2hg02nak2j802hfs2nae2j7s2o6e2j7o2hfm2j7m25sg2hgs29cg25s82hgm29c82j8m29c425s229c21ihc25t81plc1ih425t21pl429d21pl01igy1pky1ii41pm41ihy1ply2sa021v42fi42s9w21o82fem2s9u21ks21j22qlk2rva1on02rfs2sae222k1oji2rfo2qle21z22rfm2n8o2q6u2o2w2n8k2prc2rg62n8i2pr82o2q2pr62hd42n922j1k2hd02meg2j1g2hcy2mec2j1e2mea25m02hdi28yw25lw2foo28ys25lu2fok28yq2foi1i3s25me1otk1i3o22941otg1i3m22901ote228y1i461oty2s9g21a02f7i2s9e216k214u2ql01oce2rec2qky21dq2rea2n842o1g2n822po42o1e2po22hbo2iyc2hbm2m7o2iya2m7m25is28s425iq2fas28s22faq1hx01ofo1hwy21h01ofm21gy2s9620zg20xq2qkq2rdm2n7u2o0q2pmi2hay2iwq2m4a25h628oq2f3u1htm1o8q212y20u62n2o2q3w2n2g2q3q2n2c2n2a2h1s2n3g2h1k2n3a2h1g2h1e25002h2k24zs2h2e24zo24zm1gwg250s1gw8250m1gw41gw21gx81gx22qaw2rpy1jwc2qas1jsu2qaq2n1k2q3a2nhk2n1g2nhg2n1e2nhe2gyw2n1y2huw2gys2hus2gyq2huq24tk2gza26lk24tg26lg24te26le1giw24ty1k2w1gis1k2s1giq1k2q1gja1k3a2rx01q7s29oe2rwy1q4c1q2m2qac1jlq2qpg2qaa1qbi2qpe2n102ng42n0y2oac2ng22oaa2gxg2hro2gxe2jg42hrm2jg224qc26es24qa29ro26eq29rm1gc41jp01gc21qes1joy1qeq22uo2fzw22rc2fy622po22ou2rwq1px82sbe22yk1pvi22wu2qa22qoq2ri22n0q2nfe2o8q2pve2gwq2hq22jcq2mm224oq26be29kq2g3e1g8q1ji21q0q22k82fum22ik22hq1pry22m622f022e622ce2my02mxw2mxu2grs2mye2gro2grm24fc2gs624f824f61fqg24fq1fqc1fqa1fqu2q501h8e2q4y2mxg2n5g2mxe2n5e2gqc2h6c2gqa2h6a24c4258424c225821fjo1hbo1fjm1hbm2rqi1ke41kce2q4q2qca2mx62n4q2nju2gpm2h4q2hyy24ai254q26t61fga1h4q1khm1qpk29xa1qnw1qn21k8u1qri23cg2g8s23aw2g7y23a4239q1qkc23ek1qji23dq237c2g66236k23661qhq238e234s234e233i2gms2gmq2450244y1f5g1f5e2mze2gm22gu2243e24je1f221fy21hha1kn01km61qyg2a1q1qxo1qxa1kke1qzi23lc2gd823ko2gcu23kc23k61qvw23mk1qvi23m623iw2gby23ik23ie1qum23ji23ho23hi1hlq1krg1kr21r2w2a3y1r2k1r2e1kq61r3i1r1o1r1i2cio2ku01v402c4w2kn01uqo2by02kji1uk02buk1ugo2s401wps2cxk2s3s1wc02cqk2s3o1w542cn22s3m1w1o2r4g2s4s1x4o2r482s4m1wxo2r441wu62r422p5c2r582p542r522p502p4y2l742p642l6w2p5y2l6s2l6q2dao2l7w2dag2l7q2dac1tj42bcg2k8s1t5s2b5k2k5a1sz42b241svs2b0e1su42s141tyo2bjw2s101trs2bge2s0y1toc1tmm2qy02s1i1u642qxw1u2m2qxu2ors2qye2oro2orm2kfc2os62kf82kf62bqg2kfq2bqc2bqa1sdc2arc2jy61s6o2anw1s3c2am61s1o1s0u2rzo1sl42av22rzm1sho1sfy2qus1sou2quq2ol02oky2k1g2k1e2ayc2aya1rsg2ags1rp42af21rng1rmm2ryy1rwc1rum2qt62ohm2jui1ri02abi1rgc1rfi1rjy1rcs1rby1n7k286o2inw1mu827zs2ike1mnk27wc1mk827um1mik2ru01nn428e42rtw1ng828am2rtu1ncs1nb22qjs2rue1nuk2qjo1nr22qjm2nzc2qk62nz82nz62iug2nzq2iuc2iua28ko2iuu28kk28ki2ehs2ltk2pha1zgg2eb42lq41za82e7s2loe1z742e641z5k2e5a1z4s1m1s27lk2ida209s1lv427i420342em427ge1zzs1lq41zy41lpa1zxa2rsk1m9k27pa2s8k2rsi20hk1m642s8i20e41m4e20ce2qgk1mda2rck2qgi20la2rci2nsk2pkk2nsi2pki2igk2m0k2igi2m0i27sk27si1yo02dww2lj01yhs2dtk2lha1yeo2drw1yd42dr21ycc1yby1lgw27b01ywg1ldk279a1yt42dz21yrg1lb21yqm2rru1lks2s6y1z0c1lj21yym2qey2r962np62pdm2i9m2lmi27ei1y3k2dmg2ldq1y0g2dks1xyw2djy1xy41xxq1l6g275q1y7s1l4s1y641l3y1y5a1l8e1y9q1xtc2dh81xrs2dge1xr01xqm1l181xvg1l0e1xum1xo82dem1xng1xn21kym1xpa1xlo1xla1iw0260o2hku1ipc25x81im025vi1ikc1iji2rp01j3s264e2roy1j0c1iym2q9g1j7i2q9e2nec2nea2ho42ho2267o267m1p6o29682j5o1p0g292w2j3y1oxc29181ovs290e1ov01oum1ib425q41pf41i7s25oe1pbs298e1pa41i5a1p9a2roa1if02rwa1pj01ida1pha2q7u2qnu2nay2o6y2hh62j9625tm2fhc2mbc2pq621mo2fe82m9o21k02fco2m8u21io2fbw21i02fbi21ho1om828vs2j0e221s1oj428u421yo2fjw28ta21x41ogs21wc1oge21vy1i0o25ku1oqg1hz022601oos1hy6224c1ony223i1i2m1ose227y218g2f742m64215s2f5k2m5a214g2f4s213s2f4e213g213a1oc028qk21dc1oag28pq21bs2f8e21b01o9a21am1hvg1oe41hum21fg1oda21em20yo2f202m3i20xc2f1820wo2f0u20wc20w61o6w28ny21141o64210c1o5q20zy1hsu1o7y212620ts2ezg20t42ez220ss20sm1o4c20v01o3y20um20rc2ey620r020qu1o3220ry20q420py1gq824xo1gmw24vy1gl81gke1gu41gse2q4a2n3u2h2y25161jvk26ig2htq1jsg26gs1jqw26fy1jq41jpq1gfs24se1jzs1ge41jy41gda1jxa1ghq1k1q1q6829o02jek1q3k29mg2jdq1q2829lo1q1k29la1q181q121jlc26d81qb41jjs26ce1q9k1jj01q8s1jim1q8e1gak1jng1g9q1qd81jmm1qce2fz42mk82pum22ps2fxs2mjg22ow2fx42mj222og2fws22o82fwm22o41pwg29iw2jby22xs1pv429i422wg2g0s29hq22vs1pu422vg1pty22va1jg826am1pyw1jfg23081py41jf222zg1pxq22z21g7y1jha1pzy231a22io2fu82mho22hs2ftk2mha22hc2ft822h42ft222h022gy1prk29gc22ls1pqw29fy22l42fv222ks1pqe22km1jdo1pss1jda22n01pse22mm22e82frs2mge22ds2frg22dk2fra22dg22de1pp429f222fs1pos22fg1pom22fa1jce1ppq22ge22c02fqk22bs2fqe22bo22bm1pnw22cs1pnq22cm22aw2fpy22as22aq1pna22ba1fnc24e61flo1fku1fpa1h80256k1h6g255q1h5o1h5a1fi41ha41fha1h9a1kdc26rc2hy61kc026qk1kbc26q61kb01kau1h2w253y1kfs1h241kf01h1q1kem1ffi1h3y1kgu1qo029ww2jj01qn429w82jim1qmo29vw1qmg29vq1qmc1qma1k8g26os1qr41k7s26oe1qqg29xq1qq41k7a1qpy1h0c1k9o1gzy1qsc1k9a1qry2g802moo2pwu2g7k2moc2g7c2mo62g782g761qjk29ug2jhq23ds1qj429u423dc2g9829ty23d41qis23d01qiq23cy1k6026ni1ql41k5o23fc1qks1k5i23f01qkm23eu1gz21k6m1qlq23fy2g5s2mng2g5k2mna2g5g2g5e1qhc29t823801qh429t2237s2g6e237o1qgy237m1k4s1qi41k4m238s1qhy238m2g4o2mmu2g4k2g4i1qg829sm23541qg423501qg2234y1k461qgm235i2g442g421qfo233o1qfm233m1f3w1f321fw824im1fvg1fv21f1a1fxa1hgw25b01hg825am1hfw1hfq1fto1hi41fta1hhq1km826vs2i0e1kls26vg1klk26va1klg1kle1heg259q1kns26we1kng1hdy1kna1fse1hf21koe2a1c2jl82a142jl22a102a0y1kk026uk1qz42a2426ue1qyw1kjo1qys1kjm1qyq1hd81kks1hd21qzw1kkm1qzq2mqw2pxy2mqs2mqq2a082jkm2gdk2a042gdg2a022gde1kiw26ty1qw81kis23mw1qw41kiq23ms1qw223mq1hcm1kja1qwm23na2mqc2mqa29zo2gc429zm2gc21kic1qus1kia23jo1quq23jm2mq229ze2gbe1ki21qu223i21f8c1f7y1g0o24ku1g0c1g061f721g1a1hlc25d81hl425d21hl01hky1fzg1hm41fza1hly26y02i1i26xw26xu1hk825cm1krs26ye1kro1hk21krm1fyu1hkm1ks62jmc2jma26xg2a4426xe2a421hjo1kqc1hjm1r3o1kqa1r3m2jm226x62a3e1hje1kpm1r221fak1fae1g2w24ly1g2s1g2q1f9y1g3a25ec25ea1g2c1ho41g2a1ho22i22';
let _p417; const p417Table = () => _p417 || (_p417 = [0, 1, 2].map((c) => Array.from({ length: 929 }, (_, i) => parseInt(P417_TBL.substr((c * 929 + i) * 4, 4), 36))));
const P417_MIXED = '0123456789&\r\t,:#-.$/+%*=^', P417_PUNCT = ';<>@[\\]_`~!\r\t,:\n-.$/"|*()?{}\'';
const P417_START = 0x1fea8, P417_STOP = 0x3fa29; // 81111113 and 711311121
const P417_LATCH = { '0>1': [27], '0>2': [28], '0>3': [28, 25], '1>0': [28, 28], '1>2': [28], '1>3': [28, 25], '2>0': [28], '2>1': [27], '2>3': [25], '3>0': [29], '3>1': [29, 27], '3>2': [29, 28] };
function p417Text(bytes) { // submodes 0 alpha, 1 lower, 2 mixed, 3 punct; ASCII only
  const v = []; let m = 0;
  const idx = (c, mode) => mode === 0 ? (c >= 65 && c <= 90 ? c - 65 : c === 32 ? 26 : -1) : mode === 1 ? (c >= 97 && c <= 122 ? c - 97 : c === 32 ? 26 : -1)
    : mode === 2 ? (c >= 48 && c <= 57 ? c - 48 : c === 32 ? 26 : (() => { const k = P417_MIXED.indexOf(String.fromCharCode(c)); return k < 10 ? -1 : k; })()) : P417_PUNCT.indexOf(String.fromCharCode(c));
  for (const c of bytes) {
    if (idx(c, m) >= 0) { v.push(idx(c, m)); continue; }
    if (idx(c, 3) >= 0 && m !== 3) { v.push(29, idx(c, 3)); continue; } // PS shift
    if (m === 1 && c >= 65 && c <= 90) { v.push(27, c - 65); continue; } // AS shift
    const to = c >= 65 && c <= 90 ? 0 : c >= 97 && c <= 122 ? 1 : idx(c, 2) >= 0 ? 2 : 3;
    v.push(...P417_LATCH[m + '>' + to]); m = to; v.push(idx(c, m));
  }
  if (v.length & 1) v.push(29);
  const cw = []; for (let i = 0; i < v.length; i += 2) cw.push(v[i] * 30 + v[i + 1]);
  return cw;
}
function p417Byte(bytes) {
  const cw = [];
  let i = 0;
  for (; i + 6 <= bytes.length; i += 6) {
    let n = 0n; for (let k = 0; k < 6; k++) n = n * 256n + BigInt(bytes[i + k]);
    const g = []; for (let k = 0; k < 5; k++) { g.unshift(Number(n % 900n)); n /= 900n; }
    cw.push(...g);
  }
  for (; i < bytes.length; i++) cw.push(bytes[i]);
  return cw;
}
function p417Num(digits) {
  const cw = [];
  for (let i = 0; i < digits.length; i += 44) {
    let n = BigInt('1' + digits.slice(i, i + 44)); const g = [];
    while (n > 0n) { g.unshift(Number(n % 900n)); n /= 900n; }
    cw.push(...g);
  }
  return cw;
}
// Data codewords (without length descriptor) for a byte string; mode switches chosen by greedy run segmentation.
export function p417Compact(bytes, eci) {
  const isText = (c) => c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126), isDig = (c) => c >= 48 && c <= 57;
  const segs = []; // {t:'n'|'t'|'b', a, b}
  for (let i = 0; i < bytes.length;) {
    let j = i; while (j < bytes.length && isDig(bytes[j])) j++;
    if (j - i >= 13) { segs.push({ t: 'n', a: i, b: j }); i = j; continue; }
    j = i; while (j < bytes.length && isText(bytes[j]) && !(isDig(bytes[j]) && (() => { let k = j; while (k < bytes.length && isDig(bytes[k])) k++; return k - j >= 13; })())) j++;
    if (j > i) { segs.push({ t: 't', a: i, b: j }); i = j; continue; }
    j = i; while (j < bytes.length && !isText(bytes[j])) j++;
    segs.push({ t: 'b', a: i, b: j }); i = j;
  }
  for (const s of segs) if (s.t === 't' && s.b - s.a < 5) s.t = 'b'; // short text run: cheaper as bytes than two latches
  const merged = []; for (const s of segs) { const l = merged[merged.length - 1]; if (l && l.t === s.t && l.t !== 'n') l.b = s.b; else merged.push({ ...s }); }
  const cw = []; if (eci) cw.push(927, 26); // ECI 26 = UTF-8
  let mode = 't';
  for (const s of merged) {
    const part = bytes.subarray(s.a, s.b);
    if (s.t === 't') { if (mode !== 't') cw.push(900); cw.push(...p417Text(part)); mode = 't'; }
    else if (s.t === 'b') { cw.push(part.length % 6 === 0 && part.length ? 924 : 901, ...p417Byte(part)); mode = 'b'; }
    else { cw.push(902, ...p417Num(String.fromCharCode(...part))); mode = 'n'; }
  }
  return cw;
}
function p417Ecc(data, level) {
  const k = 2 << level, g = [1]; // generator = prod (x - 3^i), i=1..k, coefficients high to low
  for (let i = 1, r = 3; i <= k; i++, r = (r * 3) % 929) {
    const n = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { n[j] = (n[j] + g[j]) % 929; n[j + 1] = (n[j + 1] + 929 - ((g[j] * r) % 929)) % 929; }
    g.length = 0; g.push(...n);
  }
  const rem = new Array(k).fill(0);
  for (const d of data) {
    const t = (d + rem[0]) % 929;
    for (let j = 0; j < k - 1; j++) rem[j] = (rem[j + 1] + 929 - ((t * g[j + 1]) % 929)) % 929;
    rem[k - 1] = (929 - ((t * g[k]) % 929)) % 929;
  }
  return rem.map((x) => (929 - x) % 929);
}
export function p417Encode(text, { columns = 0, ecc = -1, aspect = 3, bytesInput } = {}) {
  const bytes = bytesInput || new TextEncoder().encode(text);
  if (!bytes.length) throw new Error('Enter some text to encode.');
  const body = p417Compact(bytes, !bytesInput && bytes.some((b) => b > 127));
  const level = ecc >= 0 ? clamp(ecc, 0, 8) : body.length <= 40 ? 2 : body.length <= 160 ? 3 : body.length <= 320 ? 4 : body.length <= 863 ? 5 : 6;
  const k = 2 << level, need1 = body.length + 1 + k;
  if (need1 > 929) throw new Error(`Too much data: ${body.length + 1} data codewords + ${k} error-correction codewords exceed the 929 limit. Lower the ECC level or shorten the text.`);
  let best = null;
  for (let c = 1; c <= 30; c++) {
    if (columns && c !== +columns) continue;
    const r = Math.max(3, Math.ceil(need1 / c)); if (r > 90) continue;
    const score = Math.abs(Math.log(((69 + 17 * c) / (r * 3)) / aspect)) + r * c * 1e-4;
    if (!best || score < best.score) best = { c, r, score };
  }
  if (!best) throw new Error('The data does not fit in the chosen number of columns (max 90 rows). Allow more columns.');
  const { c, r } = best, total = r * c, dataLen = total - k;
  const data = [dataLen - 0, ...body]; while (data.length < dataLen) data.push(900); // pad with text latch
  data[0] = dataLen;
  const all = data.concat(p417Ecc(data, level)), T = p417Table(), rows = [];
  for (let i = 0; i < r; i++) {
    const cl = i % 3, g = Math.floor(i / 3), a = 30 * g;
    const left = cl === 0 ? a + Math.floor((r - 1) / 3) : cl === 1 ? a + level * 3 + ((r - 1) % 3) : a + c - 1;
    const right = cl === 0 ? a + c - 1 : cl === 1 ? a + Math.floor((r - 1) / 3) : a + level * 3 + ((r - 1) % 3);
    let bits = P417_START.toString(2).padStart(17, '0') + T[cl][left].toString(2).padStart(17, '0');
    for (let j = 0; j < c; j++) bits += T[cl][all[i * c + j]].toString(2).padStart(17, '0');
    bits += T[cl][right].toString(2).padStart(17, '0') + P417_STOP.toString(2).padStart(18, '0');
    rows.push(bits);
  }
  return { rows, columns: c, rowCount: r, level, dataCodewords: dataLen, eccCodewords: k, codewords: all };
}
function p417Svg(rows, mod, rowH, quiet) {
  const W = rows[0].length, H = rows.length, pw = (W + 2 * quiet) * mod, ph = H * rowH * mod + 2 * quiet * mod;
  let d = '';
  rows.forEach((bits, y) => { for (let x = 0; x < W;) { if (bits[x] === '1') { let e = x; while (e < W && bits[e] === '1') e++; d += `M${x + quiet} ${y * rowH + quiet}h${e - x}v${rowH}h${x - e}z`; x = e; } else x++; } });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" viewBox="0 0 ${W + 2 * quiet} ${H * rowH + 2 * quiet}" role="img" aria-label="PDF417 barcode"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
D.push({
  id: 'pdf417-generator', cat: GENC, title: 'PDF417 Barcode Generator',
  desc: 'Encode text into a PDF417 stacked 2D barcode (as on boarding passes and ID cards): text, byte and numeric compaction, Reed-Solomon error correction, SVG download. Hand-written, checked against the zxing-cpp decoder.',
  sample: 'Hello PDF417: 2D barcode, 0123456789012345', labels: ['Text to encode (UTF-8)'],
  opts: [
    { id: 'columns', label: 'Data columns (0 = automatic, 1-30)', type: 'number', def: 0 },
    { id: 'ecc', label: 'Error correction level (-1 = automatic, 0-8)', type: 'number', def: -1 },
    { id: 'module', label: 'Module width (px)', type: 'number', def: 2 },
    { id: 'rowh', label: 'Row height (modules)', type: 'number', def: 3 },
    { id: 'quiet', label: 'Quiet zone (modules)', type: 'number', def: 2 },
  ],
  run: ([s], o) => {
    const r = p417Encode(need(s, 'some text'), { columns: clamp(o.columns, 0, 30), ecc: Number.isFinite(+o.ecc) ? +o.ecc : -1 });
    const svg = p417Svg(r.rows, clamp(o.module, 1, 10), clamp(o.rowh, 2, 8), clamp(o.quiet, 0, 10));
    return { text: `PDF417: ${r.columns} data columns x ${r.rowCount} rows, ECC level ${r.level} (${r.eccCodewords} error-correction codewords), ${r.dataCodewords - 1} data codewords incl. padding.\nSize ${69 + 17 * r.columns} x ${r.rowCount * clamp(o.rowh, 2, 8)} modules. Scan the preview below with a scanner to check it; the SVG is the download.`, blob: [new Blob([svg], { type: 'image/svg+xml' })], filename: 'pdf417.svg' };
  },
});

// =====================================================================================================
// Quotation generator: same approach as invoice-generator (form -> printable sandboxed page, print to PDF) with its own wording:
// validity date, optional discount, terms and an acceptance block. Entries are kept in this browser only.
// Skipped: logos, multiple tax rates per line, local legal wording (the notes field is free text).
// =====================================================================================================
const qMoney = (n) => (+n || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qNl = (s) => esc(s).replace(/\n/g, '<br>');
export function quoteTotals(itemsText, taxPct, discPct) {
  const items = String(itemsText || '').split('\n').filter((l) => l.trim()).map((l) => {
    const [d, q, p] = l.split('|').map((x) => x.trim());
    return { d, q: q === undefined || q === '' ? 1 : parseFloat(q) || 0, p: parseFloat(p) || 0 };
  });
  const sub = items.reduce((s, i) => s + i.q * i.p, 0), disc = sub * (clamp(discPct, 0, 100)) / 100, net = sub - disc, tax = net * (+taxPct || 0) / 100;
  return { items, sub, disc, net, tax, total: net + tax };
}
export function quoteHtml(v) {
  const t = quoteTotals(v.items, v.tax, v.discount), f = (n) => esc(v.cur) + qMoney(n);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Quotation ${esc(v.number)}</title><style>body{font:14px/1.5 system-ui,Arial,sans-serif;color:#111;margin:32px}table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;text-align:left}.r{text-align:right}h1{margin:0;font-size:32px;letter-spacing:2px}th{border-bottom:2px solid #111}td{border-bottom:1px solid #ddd}.t td{border:0}.hd{display:flex;justify-content:space-between;gap:24px}.m{color:#555}.sig{display:flex;gap:48px;margin-top:48px}.sig div{flex:1;border-top:1px solid #111;padding-top:4px}@media print{body{margin:12mm}}</style>
<div class="hd"><div><h1>QUOTATION</h1><div class="m">No. ${esc(v.number)}<br>Date: ${esc(v.date)}<br>Valid until: ${esc(v.valid)}</div></div><div class="r"><b>${qNl(v.from)}</b></div></div>
<p class="m" style="margin-top:28px">Prepared for</p><p><b>${qNl(v.to)}</b></p>${v.subject ? `<p><b>${esc(v.subject)}</b></p>` : ''}
<table><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr>
${t.items.map((i) => `<tr><td>${esc(i.d)}</td><td class="r">${i.q}</td><td class="r">${f(i.p)}</td><td class="r">${f(i.q * i.p)}</td></tr>`).join('')}
<tr class="t"><td colspan="3" class="r">Subtotal</td><td class="r">${f(t.sub)}</td></tr>
${t.disc ? `<tr class="t"><td colspan="3" class="r">Discount (${clamp(v.discount, 0, 100)}%)</td><td class="r">-${f(t.disc)}</td></tr>` : ''}
<tr class="t"><td colspan="3" class="r">Tax (${+v.tax || 0}%)</td><td class="r">${f(t.tax)}</td></tr>
<tr class="t"><td colspan="3" class="r"><b>Total quoted</b></td><td class="r"><b>${f(t.total)}</b></td></tr></table>
<p class="m" style="margin-top:28px"><b>Terms</b><br>${qNl(v.terms)}</p>
<div class="sig"><div>Accepted for ${esc((v.to || '').split('\n')[0])}: name, date, signature</div><div>For ${esc((v.from || '').split('\n')[0])}: name, date, signature</div></div></html>`;
}
const QFIELDS = [
  { id: 'from', label: 'From (your details)', rows: 3, def: 'Your Company\n1 Main Street\nCity' }, { id: 'to', label: 'Prepared for', rows: 3, def: 'Client Name\n2 Other Road\nTown' },
  { id: 'number', label: 'Quotation number', def: 'Q-001' }, { id: 'date', label: 'Date', type: 'date' }, { id: 'valid', label: 'Valid until', type: 'date' },
  { id: 'subject', label: 'Subject / project', def: 'Website redesign' }, { id: 'cur', label: 'Currency symbol', def: '$' }, { id: 'tax', label: 'Tax %', type: 'number', def: '0' }, { id: 'discount', label: 'Discount %', type: 'number', def: '0' },
  { id: 'items', label: 'Line items (one per line: description | qty | unit price)', rows: 5, def: 'Website design | 1 | 1200\nHosting (12 months) | 12 | 15.50' },
  { id: 'terms', label: 'Terms', rows: 3, def: 'Prices are valid until the date above. 50% deposit on acceptance, balance on delivery.' },
];
D.push({
  id: 'quotation-generator', cat: DOCS, title: 'Quotation Generator', custom: true,
  desc: 'Fill in a form to get a printable price quotation (estimate) with validity date, line items, discount, tax, terms and an acceptance block. Print or save as PDF; nothing is uploaded.',
  render: (root) => {
    const el = (t, p = {}, ...k) => { const e = document.createElement(t); for (const [a, v] of Object.entries(p)) { if (a.startsWith('on')) e.addEventListener(a.slice(2), v); else if (a === 'style') e.style.cssText = v; else if (a in e) e[a] = v; else e.setAttribute(a, v); } e.append(...k.flat().filter((x) => x != null)); return e; };
    const iso = (d) => d.toISOString().slice(0, 10), now = new Date(), in30 = new Date(now.getTime() + 30 * 864e5);
    const key = 'ft-quotation-generator', inputs = {}; let saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch { /* storage unavailable */ }
    const defOf = (f) => f.id === 'date' ? iso(now) : f.id === 'valid' ? iso(in30) : f.def ?? '';
    const frame = el('iframe', { sandbox: 'allow-same-origin allow-modals', title: 'Quotation preview', style: 'width:100%;height:760px;border:1px solid #888;background:#fff;margin-top:8px' });
    const upd = () => {
      const v = Object.fromEntries(Object.entries(inputs).map(([k, e]) => [k, e.value]));
      try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
      frame.srcdoc = quoteHtml(v);
    };
    const form = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px' });
    for (const f of QFIELDS) {
      const val = saved[f.id] ?? defOf(f);
      const e = f.rows ? el('textarea', { rows: f.rows, value: val, spellcheck: false, style: 'width:100%' }) : el('input', { type: f.type || 'text', value: val, style: 'width:100%' });
      e.addEventListener('input', upd); inputs[f.id] = e;
      form.append(el('label', { style: f.rows ? 'grid-column:1/-1' : '' }, f.label, el('br'), e));
    }
    const status = el('small', { role: 'status' }, 'Saved only in this browser. Choose "Save as PDF" in the print dialog to get a PDF.');
    root.append(form, el('div', { className: 'row' },
      el('button', { onclick: () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { status.textContent = 'Printing is blocked here; use Ctrl+P on this page.'; } } }, 'Print / Save as PDF'),
      el('button', { onclick: () => { try { localStorage.removeItem(key); } catch { /* ignore */ } QFIELDS.forEach((f) => { inputs[f.id].value = defOf(f); }); upd(); status.textContent = 'Reset to the example.'; } }, 'Reset')), status, frame);
    upd();
  },
});

// =====================================================================================================
// Licence compatibility matrix. NOT legal advice. Question answered: "may code under licence A be included in a combined work that is
// distributed as a whole under licence B?" (static or dynamic linking, copying, modifying: the answer is the same for the strictest reading).
// Rules come from (checked 2026): GNU "Various Licenses and Comments about Them" and GPL FAQ (gnu.org/licenses), GPL-3.0 section 13,
// LGPL-2.1 section 3 and LGPL-3.0 sections 4-5, Apache's GPL-compatibility page (apache.org/licenses/GPL-compatibility.html),
// MPL-2.0 sections 1.12, 3.3 and 3.5 and its FAQ, EPL-2.0 section 1 (Secondary License) and its FAQ, and the licence texts themselves.
// Skipped: licences outside the list, exceptions (WITH ...) beyond a warning, jurisdiction-specific rules, patents beyond what the texts say,
// dual-licensing history of a project, and whether your use is a "derivative work" at all (that is a legal question, not a licence one).
// =====================================================================================================
const LIC = {
  'MIT': 'perm', 'BSD-2-Clause': 'perm', 'BSD-3-Clause': 'perm', 'ISC': 'perm', '0BSD': 'perm', 'Zlib': 'perm', 'Unlicense': 'perm', 'CC0-1.0': 'perm',
  'Apache-2.0': 'apache', 'MPL-2.0': 'mpl', 'EPL-1.0': 'epl1', 'EPL-2.0': 'epl2', 'CDDL-1.0': 'cddl',
  'LGPL-2.1-only': 'lgpl', 'LGPL-2.1-or-later': 'lgpl', 'LGPL-3.0-only': 'lgpl', 'LGPL-3.0-or-later': 'lgpl',
  'GPL-2.0-only': 'gpl', 'GPL-2.0-or-later': 'gpl', 'GPL-3.0-only': 'gpl', 'GPL-3.0-or-later': 'gpl',
  'AGPL-3.0-only': 'agpl', 'AGPL-3.0-or-later': 'agpl', 'Proprietary': 'prop',
};
const LIC_ALIAS = { 'gpl-2.0': 'GPL-2.0-only', 'gpl-2.0+': 'GPL-2.0-or-later', 'gpl-3.0': 'GPL-3.0-only', 'gpl-3.0+': 'GPL-3.0-or-later', 'lgpl-2.1': 'LGPL-2.1-only', 'lgpl-2.1+': 'LGPL-2.1-or-later', 'lgpl-3.0': 'LGPL-3.0-only', 'lgpl-3.0+': 'LGPL-3.0-or-later', 'agpl-3.0': 'AGPL-3.0-only', 'agpl-3.0+': 'AGPL-3.0-or-later', 'bsd': 'BSD-3-Clause', 'apache 2.0': 'Apache-2.0', 'apache-2': 'Apache-2.0', 'closed': 'Proprietary', 'commercial': 'Proprietary', 'public domain': 'Unlicense' };
const LIC_LOW = Object.fromEntries(Object.keys(LIC).map((k) => [k.toLowerCase(), k]));
export const licNormalise = (s) => { const k = String(s).trim().toLowerCase(); return LIC_LOW[k] || LIC_ALIAS[k] || null; };
// Versions of the GNU licence family a licence permits for the combined work. gpl: {2,3}; lgpl: {2.1,3}.
const gnuVers = (id) => ({ 'GPL-2.0-only': [2], 'GPL-2.0-or-later': [2, 3], 'GPL-3.0-only': [3], 'GPL-3.0-or-later': [3], 'LGPL-2.1-only': [2.1], 'LGPL-2.1-or-later': [2.1, 3], 'LGPL-3.0-only': [3], 'LGPL-3.0-or-later': [3], 'AGPL-3.0-only': [3], 'AGPL-3.0-or-later': [3] }[id]);
const SRC = { gnu: 'gnu.org/licenses/license-list.html', faq: 'gnu.org/licenses/gpl-faq.html', apache: 'apache.org/licenses/GPL-compatibility.html', mpl: 'MPL-2.0 sections 1.12 and 3.3, mozilla.org/MPL/2.0/FAQ', epl: 'EPL-2.0 section 1 and eclipse.org/legal/epl-2.0/faq.php' };
const Y = (why) => ({ r: 'yes', why }), C = (why) => ({ r: 'cond', why }), N = (why) => ({ r: 'no', why });
// Outbound licences offered as targets in the matrix.
export const LIC_TARGETS = ['MIT', 'Apache-2.0', 'MPL-2.0', 'EPL-2.0', 'LGPL-2.1-or-later', 'LGPL-3.0-or-later', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-or-later', 'AGPL-3.0-or-later', 'Proprietary'];
export function licCompat(a, b) {
  const fa = LIC[a], fb = LIC[b];
  if (fa === 'perm') return Y('permissive licence: allowed in any combined work if the copyright and licence notice is kept');
  if (fa === 'apache') {
    if (fb === 'gpl' || fb === 'lgpl') {
      const v = gnuVers(b);
      if (v.every((x) => x === 2 || x === 2.1)) return N(`Apache-2.0 is incompatible with GPLv2 and LGPLv2.1 (patent and indemnity terms; ${SRC.apache})`);
      if (v.includes(2) || v.includes(2.1)) return C('only under the GPL/LGPL version 3 terms: the combined work cannot be used under version 2 (' + SRC.apache + ')');
    }
    return Y('Apache-2.0 allows relicensing of combinations if its licence, NOTICE and attributions are kept; compatible with GPLv3 / AGPLv3 (' + SRC.apache + ')');
  }
  if (fa === 'mpl') {
    if (a === b) return Y('same licence');
    if (fb === 'gpl' || fb === 'lgpl' || fb === 'agpl') return C('allowed through the MPL-2.0 "Secondary License" clause (sections 1.12, 3.3) unless the file carries an "Incompatible With Secondary Licenses" notice; the MPL files stay available under the MPL');
    return C('MPL-2.0 is file-level copyleft: the MPL-covered files stay under MPL (with their source), the rest of the larger work may use other terms (section 3.3)');
  }
  if (fa === 'epl2') {
    if (a === b) return Y('same licence');
    if (fb === 'gpl' || fb === 'lgpl' || fb === 'agpl') return C('only if the EPL-2.0 code names the GPL as a "Secondary License" (' + SRC.epl + '); otherwise not');
    return C('EPL is module-level copyleft: EPL-covered modules stay under EPL, other parts of the work may use other terms');
  }
  if (fa === 'epl1' || fa === 'cddl') {
    if (fb === 'gpl' || fb === 'agpl' || fb === 'lgpl') return N(`${a} is listed by the FSF as incompatible with the GPL family (${SRC.gnu})`);
    if (a === b) return Y('same licence');
    return C(`${a} is file/module-level copyleft: its files stay under ${a}, the rest of the work may use other terms`);
  }
  if (fa === 'lgpl') {
    const va = gnuVers(a);
    if (fb === 'lgpl') return gnuVers(b).some((x) => va.includes(x)) ? (gnuVers(b).every((x) => va.includes(x)) ? Y('same LGPL version range') : C('allowed under only the versions both licences share')) : N('no common LGPL version (LGPL-2.1-only is not compatible with LGPL-3.0)');
    if (fb === 'gpl') {
      const gv = va.includes(2.1) ? [2, 3] : [3], ov = gnuVers(b).filter((x) => gv.includes(x));
      return ov.length === 0 ? N('LGPL-3.0 code can only be converted to GPLv3 or later') : ov.length === gnuVers(b).length ? Y('LGPL section 3 (2.1) / section 2 (3.0) lets you apply the ordinary GPL instead') : C('only under the GPL versions that LGPL permits: ' + ov.join(', '));
    }
    if (fb === 'agpl') return Y('convert LGPL to GPLv3 (LGPL-2.1 section 3 / LGPL-3.0 section 2), then GPLv3 section 13 allows combining with AGPLv3');
    return C('LGPL permits a larger work under other terms if the library stays LGPL, users can replace it (dynamic linking or relinkable objects) and licence/source obligations are met; static linking in closed code is hard');
  }
  if (fa === 'gpl') {
    const va = gnuVers(a);
    if (fb === 'gpl') { const vb = gnuVers(b), both = vb.filter((x) => va.includes(x)); return both.length === 0 ? N(`GPLv2-only and GPLv3 are not compatible with each other (${SRC.faq})`) : both.length === vb.length ? Y('target version range is covered by the source licence') : C('combined work is effectively limited to GPL version ' + both.join(', ') + ' (the source code cannot be used under the other version)'); }
    if (fb === 'agpl') return va.includes(3) ? Y('GPLv3 section 13 allows linking GPLv3 and AGPLv3 code; each part keeps its licence and the AGPL network clause applies to the whole') : N('GPLv2-only code cannot be combined with AGPLv3');
    return N('GPL code requires the combined work to be GPL (or a stronger licence); LGPL, permissive, weak-copyleft and proprietary distribution is not allowed');
  }
  if (fa === 'agpl') {
    if (fb === 'agpl') return Y('same licence');
    return N('AGPLv3 requires the combined work (including network use) to be AGPLv3; GPLv3 section 13 only lets GPL code be combined into an AGPL work, not the reverse');
  }
  if (fa === 'prop') return fb === 'prop' ? C('depends entirely on your agreement with the rights holder') : N('proprietary code cannot be placed under an open licence unless you own it or the rights holder agrees');
  return N('unknown');
}
// Parse an SPDX-like expression: OR / AND / WITH / parentheses; returns a tree {op, args} or {id}.
export function licParse(expr) {
  const toks = String(expr).replace(/([()])/g, ' $1 ').split(/\s+/).filter(Boolean); let i = 0; const warn = [];
  const atom = () => {
    const t = toks[i++]; if (t === undefined) throw new Error('Unexpected end of licence expression "' + expr + '"');
    if (t === '(') { const e = or(); if (toks[i++] !== ')') throw new Error('Missing ) in "' + expr + '"'); return e; }
    let name = t; while (i < toks.length && !/^(and|or|with|\)|\()$/i.test(toks[i]) && /^(\d|\.|-)/.test(toks[i]) ) name += ' ' + toks[i++];
    if (toks[i] && /^with$/i.test(toks[i])) { warn.push(`exception "${toks[i + 1]}" is not evaluated (exceptions can add permissions); treated as plain ${name}`); i += 2; }
    const id = licNormalise(name); return id ? { id } : { unknown: name };
  };
  const and = () => { let n = atom(); while (toks[i] && /^and$/i.test(toks[i])) { i++; n = { op: 'and', args: [n, atom()] }; } return n; };
  const or = () => { let n = and(); while (toks[i] && /^or$/i.test(toks[i])) { i++; n = { op: 'or', args: [n, and()] }; } return n; };
  const tree = or(); if (i < toks.length) throw new Error('Unexpected "' + toks[i] + '" in "' + expr + '"');
  return { tree, warn };
}
const LIC_RANK = { yes: 2, cond: 1, no: 0 };
export function licEval(node, target) {
  if (node.unknown) return { r: 'unknown', why: `licence "${node.unknown}" is not in the table` };
  if (node.id) return licCompat(node.id, target);
  const rs = node.args.map((a) => licEval(a, target));
  if (rs.some((x) => x.r === 'unknown')) return rs.find((x) => x.r === 'unknown');
  const pick = node.op === 'or' ? (a, b) => (LIC_RANK[b.r] > LIC_RANK[a.r] ? b : a) : (a, b) => (LIC_RANK[b.r] < LIC_RANK[a.r] ? b : a);
  return rs.reduce(pick);
}
export function licReport(text, outbound) {
  const deps = String(text).split(/\r?\n|,(?![^(]*\))/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => { const m = /^([^:]+):\s+(.+)$/.exec(l); return m ? { name: m[1].trim(), expr: m[2].trim() } : { name: l, expr: l }; });
  if (!deps.length) throw new Error('Enter at least one licence, for example MIT or (MIT OR Apache-2.0).');
  const out = [], parsed = deps.map((d) => ({ ...d, ...licParse(d.expr) }));
  const unk = [...new Set(parsed.flatMap((p) => { const f = (n) => (n.unknown ? [n.unknown] : n.args ? n.args.flatMap(f) : []); return f(p.tree); }))];
  const known = parsed.filter((p) => { const f = (n) => (n.unknown ? true : n.args ? n.args.some(f) : false); return !f(p.tree); });
  const sym = { yes: 'YES ', cond: 'COND', no: 'NO  ', unknown: '??  ' };
  out.push('Question: can code under the row licence be part of a combined work that is distributed as a whole under the column licence?', 'YES = allowed, COND = allowed with the conditions below, NO = not allowed, ?? = licence not in this table.', '');
  out.push(table(['Dependency', 'Licence', ...LIC_TARGETS.map((t) => t.replace('-or-later', '+').replace('-only', ''))], parsed.map((p) => [p.name === p.expr ? '' : p.name, p.expr, ...LIC_TARGETS.map((t) => sym[licEval(p.tree, t).r].trim())])));
  const cand = LIC_TARGETS.filter((t) => known.length && known.every((p) => licEval(p.tree, t).r !== 'no'));
  const clean = LIC_TARGETS.filter((t) => known.length && known.every((p) => licEval(p.tree, t).r === 'yes'));
  out.push('', `Licences the combined work could be distributed under (no NO from any dependency): ${cand.join(', ') || 'none in the table: the dependency licences conflict'}`, `...of which with no conditions at all: ${clean.join(', ') || 'none'}`);
  if (outbound && outbound !== 'none') {
    out.push('', `Details for a combined work under ${outbound}:`);
    for (const p of parsed) { const r = licEval(p.tree, outbound); out.push(`  [${sym[r.r].trim()}] ${p.name === p.expr ? p.expr : p.name + ' (' + p.expr + ')'}: ${r.why}`); }
  }
  const warns = parsed.flatMap((p) => p.warn); if (warns.length) out.push('', ...warns.map((w) => 'Note: ' + w));
  if (unk.length) out.push('', 'Not in the table: ' + unk.join(', ') + '. Supported: ' + Object.keys(LIC).join(', ') + '.');
  out.push('', 'Not legal advice. This table applies the published licence texts and the FSF, Apache and Mozilla compatibility statements to whole-work distribution. It does not know how your code is actually combined, whether it is a derivative work, dual-licensing, patents, or other terms. Ask a lawyer for anything that matters.');
  return out.join('\n');
}
D.push({
  id: 'license-compatibility-matrix', cat: 'Dev Extras', title: 'Open Source Licence Compatibility Matrix (Not Legal Advice)',
  desc: 'List the SPDX licences of your dependencies (MIT, Apache-2.0, GPL-3.0-only, MPL-2.0, ... also (A OR B) expressions) and see which licences the combined work can use, with the rule and source behind each answer. Information only, not legal advice.',
  labels: ['Dependency licences, one per line (SPDX id or expression, optional "name: licence")'],
  sample: 'left-pad: MIT\nreact-like: (MIT OR Apache-2.0)\nlib-a: Apache-2.0\nfast-json: MPL-2.0\nreadline-ext: LGPL-3.0-or-later',
  opts: [{ id: 'target', label: 'Show details for this outbound licence', type: 'select', choices: ['none', ...LIC_TARGETS], def: 'GPL-3.0-or-later' }],
  run: ([s], o) => licReport(need(s, 'at least one licence'), o.target),
});

// =====================================================================================================
// Outlook .msg viewer: a Compound File Binary (OLE2) reader, v3 and v4, FAT / mini-FAT / DIFAT, plus the MS-OXMSG property layout.
// Shows headers, recipients, plain / HTML / compressed-RTF body, attachments (extractable, embedded messages are listed) and transport headers.
// Verified against extract-msg on messages built with an independent CFB writer. Skipped: encrypted / IRM-protected messages, named
// property resolution (so appointments, contacts and tasks show only their standard fields), digital signatures, TNEF attachments, writing .msg.
// =====================================================================================================
export function cfbParse(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (u8.length < 512 || SIG.some((b, i) => u8[i] !== b)) throw new Error('Not an Outlook .msg / OLE compound file (signature D0CF11E0 not found).');
  const sh = dv.getUint16(0x1e, true), msh = dv.getUint16(0x20, true), ss = 1 << sh, mss = 1 << msh;
  if (sh !== 9 && sh !== 12) throw new Error('Unsupported sector size shift ' + sh);
  const secOff = (i) => (i + 1) * ss, END = 0xfffffffe, FREE = 0xffffffff;
  const nFat = dv.getUint32(0x2c, true), firstDir = dv.getUint32(0x30, true), cutoff = dv.getUint32(0x38, true), firstMini = dv.getUint32(0x3c, true), nMini = dv.getUint32(0x40, true), firstDifat = dv.getUint32(0x44, true), nDifat = dv.getUint32(0x48, true);
  const inRange = (o, n) => o >= 0 && o + n <= u8.length;
  const fatSecs = []; for (let i = 0; i < 109 && fatSecs.length < nFat; i++) { const s = dv.getUint32(0x4c + i * 4, true); if (s < 0xfffffffa) fatSecs.push(s); }
  for (let d = firstDifat, n = 0; d < 0xfffffffa && n < nDifat && n < 4096; n++) { const o = secOff(d); if (!inRange(o, ss)) break; for (let k = 0; k < ss / 4 - 1 && fatSecs.length < nFat; k++) { const s = dv.getUint32(o + k * 4, true); if (s < 0xfffffffa) fatSecs.push(s); } d = dv.getUint32(o + ss - 4, true); }
  const fat = []; for (const s of fatSecs) { const o = secOff(s); if (!inRange(o, ss)) throw new Error('FAT sector outside the file (truncated or corrupt .msg).'); for (let k = 0; k < ss / 4; k++) fat.push(dv.getUint32(o + k * 4, true)); }
  const chain = (start, table) => { const out = []; for (let s = start; s < 0xfffffffa && out.length <= table.length; s = table[s] ?? END) out.push(s); return out; };
  const readChain = (start, size, table, secSize, off) => {
    const out = new Uint8Array(size); let p = 0;
    for (const s of chain(start, table)) { if (p >= size) break; const o = off(s), n = Math.min(secSize, size - p); if (!inRange(o, n)) throw new Error('Stream data outside the file (truncated .msg).'); out.set(u8.subarray(o, o + n), p); p += n; }
    if (p < size) throw new Error('Stream chain is shorter than its size (corrupt .msg).');
    return out;
  };
  const dirBytes = (() => { const secs = chain(firstDir, fat), out = new Uint8Array(secs.length * ss); secs.forEach((s, i) => { const o = secOff(s); if (!inRange(o, ss)) throw new Error('Directory outside the file.'); out.set(u8.subarray(o, o + ss), i * ss); }); return out; })();
  const ddv = new DataView(dirBytes.buffer), ents = [];
  for (let i = 0; i * 128 < dirBytes.length; i++) {
    const b = i * 128, nl = Math.min(ddv.getUint16(b + 64, true), 64), type = dirBytes[b + 66]; if (!type) { ents.push(null); continue; }
    let name = ''; for (let k = 0; k + 2 < nl; k += 2) name += String.fromCharCode(ddv.getUint16(b + k, true));
    ents.push({ i, name, type, left: ddv.getUint32(b + 68, true), right: ddv.getUint32(b + 72, true), child: ddv.getUint32(b + 76, true), start: ddv.getUint32(b + 116, true), size: ddv.getUint32(b + 120, true) + ddv.getUint32(b + 124, true) * 4294967296 });
  }
  const root = ents[0]; if (!root || root.type !== 5) throw new Error('Compound file has no root entry.');
  const miniFat = []; for (const s of chain(firstMini, fat).slice(0, nMini)) { const o = secOff(s); if (!inRange(o, ss)) break; for (let k = 0; k < ss / 4; k++) miniFat.push(dv.getUint32(o + k * 4, true)); }
  let mini = null;
  const read = (e) => {
    if (e.type === 2 && e.size < cutoff) { mini ||= readChain(root.start, root.size, fat, ss, secOff); const out = new Uint8Array(e.size); let p = 0; for (const s of chain(e.start, miniFat)) { if (p >= e.size) break; const o = s * mss, n = Math.min(mss, e.size - p); if (o + n > mini.length) throw new Error('Mini stream outside its container.'); out.set(mini.subarray(o, o + n), p); p += n; } if (p < e.size) throw new Error('Mini stream chain is shorter than its size.'); return out; }
    return readChain(e.start, e.size, fat, ss, secOff);
  };
  // children of a storage: in-order walk of the red-black tree
  const kids = (e) => { const out = [], seen = new Set(); const walk = (id) => { if (id >= ents.length || id === FREE || seen.has(id) || !ents[id]) return; seen.add(id); walk(ents[id].left); out.push(ents[id]); walk(ents[id].right); }; walk(e.child); return out; };
  return { root, ents, kids, read };
}
const FILETIME = (dv, o) => { const v = dv.getUint32(o, true) + dv.getUint32(o + 4, true) * 4294967296; if (!v) return null; const ms = v / 10000 - 11644473600000; return Number.isFinite(ms) && ms > -2e12 && ms < 1e13 ? new Date(ms) : null; };
export function lzfuDecompress(b) { // MS-OXRTFCP
  if (b.length < 16) throw new Error('Compressed RTF header too short.');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), comp = dv.getUint32(0, true), raw = dv.getUint32(4, true), magic = dv.getUint32(8, true);
  if (magic === 0x414c454d) return b.subarray(16, 16 + raw); // MELA: stored uncompressed
  if (magic !== 0x75465a4c) throw new Error('Unknown compressed RTF type.');
  const PRE = new TextEncoder().encode('{\\rtf1\\ansi\\mac\\deff0\\deftab720{\\fonttbl;}{\\f0\\fnil \\froman \\fswiss \\fmodern \\fscript \\fdecor MS Sans SerifSymbolArialTimes New RomanCourier{\\colortbl\\red0\\green0\\blue0\r\n\\par \\pard\\plain\\f0\\fs20\\b\\i\\u\\tab\\tx');
  const dict = new Uint8Array(4096); dict.set(PRE); let w = PRE.length; const out = [];
  let i = 16; const end = Math.min(b.length, comp + 4);
  while (i < end && out.length < raw) {
    const ctl = b[i++];
    for (let bit = 0; bit < 8 && i < end && out.length < raw; bit++) {
      if (ctl & (1 << bit)) { const t = (b[i] << 8) | b[i + 1]; i += 2; let off = t >> 4; const len = (t & 15) + 2; for (let k = 0; k < len; k++) { const c = dict[(off + k) % 4096]; out.push(c); dict[w % 4096] = c; w++; } }
      else { const c = b[i++]; out.push(c); dict[w % 4096] = c; w++; }
    }
  }
  return Uint8Array.from(out.slice(0, raw));
}
const rtfDrop = (s) => { for (const g of ['\\fonttbl', '\\colortbl', '\\stylesheet', '\\info']) { for (let i = s.indexOf('{' + g); i >= 0; i = s.indexOf('{' + g)) { let d = 0, j = i; for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; } s = s.slice(0, i) + s.slice(j + 1); } } return s; };
const rtfText = (s) => rtfDrop(s).replace(/\{\\\*[^{}]*\}/g, '').replace(/\\par[d]?\b ?/g, '\n').replace(/\\tab\b ?/g, '\t').replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode(+n < 0 ? +n + 65536 : +n)).replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '').replace(/\n{3,}/g, '\n\n').trim();
export function msgParse(u8) {
  const cfb = cfbParse(u8), dec = (bytes, cp) => { try { return new TextDecoder(cp === 65001 ? 'utf-8' : cp === 1200 ? 'utf-16le' : 'windows-' + cp).decode(bytes); } catch { return new TextDecoder('windows-1252').decode(bytes); } };
  function props(storage, hdr, cp) {
    const byName = Object.fromEntries(cfb.kids(storage).map((e) => [e.name.toUpperCase(), e])), p = {};
    const ps = byName['__PROPERTIES_VERSION1.0']; if (!ps) return p;
    const b = cfb.read(ps), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    for (let o = hdr; o + 16 <= b.length; o += 16) {
      const tag = dv.getUint32(o, true), id = tag >>> 16, ty = tag & 0xffff, key = id.toString(16).padStart(4, '0'), sub = byName['__SUBSTG1.0_' + tag.toString(16).toUpperCase().padStart(8, '0')];
      if (ty === 0x1f && sub) p[key] = new TextDecoder('utf-16le').decode(cfb.read(sub)).replace(/\0+$/, '');
      else if (ty === 0x1e && sub) p[key] = dec(cfb.read(sub), cp).replace(/\0+$/, '');
      else if (ty === 0x102 && sub) p[key] = cfb.read(sub);
      else if (ty === 0x3) p[key] = dv.getInt32(o + 8, true);
      else if (ty === 0xb) p[key] = !!dv.getUint16(o + 8, true);
      else if (ty === 0x40) p[key] = FILETIME(dv, o + 8);
      else if (ty === 0x14) p[key] = Number(dv.getBigInt64(o + 8, true));
      else if (ty === 0xd && sub !== undefined) p[key] = 'embedded';
    }
    if (byName['__SUBSTG1.0_3701000D']) p['3701'] = 'embedded';
    return p;
  }
  const kids = cfb.kids(cfb.root), pre = (s) => kids.filter((e) => e.type === 1 && e.name.toLowerCase().startsWith(s)).sort((a, b) => a.name.localeCompare(b.name));
  const hasProps = kids.some((e) => e.name.toLowerCase() === '__properties_version1.0'); if (!hasProps) throw new Error('This compound file has no MAPI property stream, so it is not an Outlook message (.msg).');
  const pr0 = kids.find((e) => e.name.toLowerCase() === '__properties_version1.0'), hdr0 = cfb.read(pr0); // codepage first
  let cp = 1252; { const dv = new DataView(hdr0.buffer, hdr0.byteOffset, hdr0.byteLength); for (let o = 32; o + 16 <= hdr0.length; o += 16) if (dv.getUint32(o, true) === 0x3ffd0003) cp = dv.getInt32(o + 8, true); }
  const m = props(cfb.root, 32, cp);
  const recipients = pre('__recip_version1.0_').map((e) => { const q = props(e, 8, cp); return { type: { 1: 'To', 2: 'Cc', 3: 'Bcc' }[q['0c15']] || 'To', name: q['3001'] || '', address: q['39fe'] || q['3003'] || '' }; });
  const attachments = pre('__attach_version1.0_').map((e) => { const q = props(e, 8, cp); return { name: q['3707'] || q['3704'] || q['3001'] || '(unnamed)', mime: q['370e'] || '', size: q['3701'] instanceof Uint8Array ? q['3701'].length : null, data: q['3701'] instanceof Uint8Array ? q['3701'] : null, embedded: q['3701'] === 'embedded' || q['3705'] === 5, cid: q['3712'] || '', method: q['3705'] }; });
  let body = m['1000'], html = null, rtf = null;
  if (m['1013']) html = typeof m['1013'] === 'string' ? m['1013'] : dec(m['1013'], m['3fde'] || cp);
  if (m['1009'] instanceof Uint8Array) { try { rtf = new TextDecoder('windows-1252').decode(lzfuDecompress(m['1009'])); } catch { /* ignore */ } }
  if (!html && rtf && /\\fromhtml1/.test(rtf)) html = rtf.replace(/\{\\\*\\htmltag[0-9]*\s*([^{}]*)\}/g, '$1').replace(/\\htmlrtf[0-9]*\s?/g, '').replace(/\\par\b/g, '').replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\{\\\*?\\[a-z]+[^{}]*\}/g, '').replace(/\\[a-z]+-?\d* ?/g, '').replace(/[{}]/g, '');
  return { subject: m['0037'] || '', body: body ?? (rtf ? rtfText(rtf) : ''), bodyFrom: body != null ? 'plain text' : rtf ? 'compressed RTF (converted roughly)' : 'none', html, from: m['0c1a'] || '', fromAddr: m['5d01'] || m['0c1f'] || '', fromAddrType: m['0c1e'] || '', to: m['0e04'] || '', cc: m['0e03'] || '', bcc: m['0e02'] || '', sent: m['0039'] || null, received: m['0e06'] || null, headers: m['007d'] || '', messageId: m['1035'] || '', importance: m['0017'], flagsRead: m['0e07'], codepage: cp, recipients, attachments, props: m };
}
D.push({
  id: 'outlook-msg-viewer', cat: DOCS, title: 'Outlook .msg Viewer (Headers, Body, Attachments)', inputs: 0,
  desc: 'Open an Outlook .msg file and read it in your browser: sender, recipients, dates, plain or HTML body, transport headers and attachments (download one). Hand-written OLE reader; the file is never uploaded.',
  file: { accept: '.msg,application/vnd.ms-outlook' },
  opts: [{ id: 'extract', label: 'Download attachment number (0 = none)', type: 'number', def: 0 }, { id: 'headers', label: 'Show internet headers', type: 'checkbox', def: true }],
  run: async (_i, o, files) => {
    if (!files?.[0]) throw new Error('Choose a .msg file.');
    const m = msgParse(await u8of(files[0])), L = (d) => (d ? d.toISOString().replace('.000Z', 'Z') : '');
    const n = Math.floor(+o.extract || 0);
    if (n > 0) { const a = m.attachments[n - 1]; if (!a) throw new Error(`No attachment number ${n}; this message has ${m.attachments.length}.`); if (!a.data) throw new Error(`Attachment ${n} (${a.name}) is ${a.embedded ? 'an embedded message or object, which this viewer lists but cannot export' : 'not stored as plain data'}.`); return { text: `Attachment ${n}: ${a.name} (${a.size} bytes)`, blob: [new Blob([a.data], { type: a.mime || 'application/octet-stream' })], filename: a.name }; }
    const fmt = (r) => (r.name && r.address && r.name !== r.address ? `${r.name} <${r.address}>` : r.address || r.name);
    const L2 = [`Subject:   ${m.subject}`, `From:      ${m.from}${m.fromAddr ? ' <' + m.fromAddr + '>' : ''}${m.fromAddrType === 'EX' ? '  (Exchange address, SMTP address not stored)' : ''}`,
      `To:        ${m.recipients.filter((r) => r.type === 'To').map(fmt).join('; ') || m.to}`, ...(m.recipients.some((r) => r.type === 'Cc') || m.cc ? [`Cc:        ${m.recipients.filter((r) => r.type === 'Cc').map(fmt).join('; ') || m.cc}`] : []), ...(m.recipients.some((r) => r.type === 'Bcc') || m.bcc ? [`Bcc:       ${m.recipients.filter((r) => r.type === 'Bcc').map(fmt).join('; ') || m.bcc}`] : []),
      ...(m.sent ? [`Sent:      ${L(m.sent)}`] : []), ...(m.received ? [`Received:  ${L(m.received)}`] : []), ...(m.messageId ? [`Message-ID: ${m.messageId}`] : []), '', `--- Body (${m.bodyFrom}${m.html ? ', an HTML version is shown below the text' : ''}) ---`, m.body.trim() || '(no text body)', '',
      `--- Attachments (${m.attachments.length}) ---`, ...m.attachments.map((a, i) => `${i + 1}. ${a.name}  ${a.mime}  ${a.size != null ? a.size + ' bytes' : a.embedded ? 'embedded message (not exportable here)' : 'size unknown'}`)];
    if (o.headers && m.headers) L2.push('', '--- Internet headers ---', m.headers.trim());
    const res = { text: L2.join('\n') };
    if (m.html) res.html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><body style="font:15px system-ui;margin:1rem">${m.html}</body>`;
    return res;
  },
});

// =====================================================================================================
// Apache Arrow IPC decoder (stream format and file / Feather v2 format). Hand-written FlatBuffers reader, schema + record batches +
// dictionaries, LZ4-frame buffer compression (hand-written decoder). Types: null, bool, int8-64, uint8-64, float16/32/64, utf8, large utf8,
// binary, large binary, fixed-size binary, date32/64, time, timestamp, duration, decimal128, list, large list, fixed-size list, struct, map,
// dictionary-encoded columns. Verified against pyarrow (to_pylist) on files written by pyarrow, with and without compression.
// Skipped: ZSTD-compressed buffers (a ZSTD decoder is a separate large piece), unions, run-end / view types, sparse tensors, decimal256, interval,
// extension types (shown as their storage type), big-endian files, memory mapping of huge files (everything is read into memory).
// =====================================================================================================
function lz4Block(src, out, op, uncompressedMax) { // decode one LZ4 block into out starting at op; returns new op
  let ip = 0;
  while (ip < src.length) {
    const tok = src[ip++]; let lit = tok >> 4;
    if (lit === 15) { let b; do { b = src[ip++]; lit += b; } while (b === 255); }
    if (op + lit > uncompressedMax) throw new Error('LZ4: output larger than declared.');
    for (let k = 0; k < lit; k++) out[op++] = src[ip++];
    if (ip >= src.length) break;
    const off = src[ip] | (src[ip + 1] << 8); ip += 2; if (!off || off > op) throw new Error('LZ4: bad match offset.');
    let ml = tok & 15; if (ml === 15) { let b; do { b = src[ip++]; ml += b; } while (b === 255); } ml += 4;
    if (op + ml > uncompressedMax) throw new Error('LZ4: output larger than declared.');
    for (let k = 0; k < ml; k++, op++) out[op] = out[op - off];
  }
  return op;
}
export function lz4FrameDecode(src, sizeHint) {
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  if (src.length < 7 || dv.getUint32(0, true) !== 0x184d2204) throw new Error('LZ4: bad frame magic.');
  const flg = src[4], bd = src[5], hasSize = flg & 8, hasBlockCk = flg & 16, hasCk = flg & 4, hasDict = flg & 1;
  if ((flg >> 6) !== 1) throw new Error('LZ4: unsupported frame version.'); if (hasDict) throw new Error('LZ4: dictionaries are not supported.');
  let ip = 6; let total = sizeHint; if (hasSize) { total = dv.getUint32(ip, true); ip += 8; } ip += 1; // header checksum
  const blockMax = [0, 0, 0, 0, 65536, 262144, 1048576, 4194304][(bd >> 4) & 7];
  const out = new Uint8Array(total ?? 0); let op = 0, cap = out;
  for (;;) {
    const bs = dv.getUint32(ip, true); ip += 4; if (bs === 0) break;
    const raw = !!(bs & 0x80000000), n = bs & 0x7fffffff;
    if (op + blockMax > cap.length && total == null) { const g = new Uint8Array(Math.max(cap.length * 2, op + blockMax)); g.set(cap.subarray(0, op)); cap = g; }
    if (raw) { cap.set(src.subarray(ip, ip + n), op); op += n; } else op = lz4Block(src.subarray(ip, ip + n), cap, op, cap.length);
    ip += n + (hasBlockCk ? 4 : 0);
  }
  void hasCk; return total != null ? cap.subarray(0, op) : cap.subarray(0, op);
}
const fbOf = (u8) => {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const field = (t, i) => { const v = t - dv.getInt32(t, true), vs = dv.getUint16(v, true); if (4 + 2 * i >= vs) return 0; const o = dv.getUint16(v + 4 + 2 * i, true); return o ? t + o : 0; };
  const ind = (a) => a + dv.getUint32(a, true);
  return {
    dv, root: () => ind(0), field,
    i8: (t, i, d = 0) => { const a = field(t, i); return a ? dv.getInt8(a) : d; }, u8: (t, i, d = 0) => { const a = field(t, i); return a ? dv.getUint8(a) : d; },
    i16: (t, i, d = 0) => { const a = field(t, i); return a ? dv.getInt16(a, true) : d; }, i32: (t, i, d = 0) => { const a = field(t, i); return a ? dv.getInt32(a, true) : d; },
    i64: (t, i, d = 0) => { const a = field(t, i); return a ? Number(dv.getBigInt64(a, true)) : d; }, bool: (t, i, d = false) => { const a = field(t, i); return a ? !!dv.getUint8(a) : d; },
    tbl: (t, i) => { const a = field(t, i); return a ? ind(a) : 0; },
    str: (t, i) => { const a = field(t, i); if (!a) return null; const p = ind(a), n = dv.getUint32(p, true); return new TextDecoder().decode(u8.subarray(p + 4, p + 4 + n)); },
    vec: (t, i) => { const a = field(t, i); if (!a) return { n: 0, at: () => 0, base: 0 }; const p = ind(a), n = dv.getUint32(p, true); return { n, base: p + 4, at: (k) => ind(p + 4 + 4 * k) }; },
  };
};
const ARROW_TYPES = { 1: 'null', 2: 'int', 3: 'float', 4: 'binary', 5: 'utf8', 6: 'bool', 7: 'decimal', 8: 'date', 9: 'time', 10: 'timestamp', 11: 'interval', 12: 'list', 13: 'struct', 14: 'union', 15: 'fixedsizebinary', 16: 'fixedsizelist', 17: 'map', 18: 'duration', 19: 'largebinary', 20: 'largeutf8', 21: 'largelist', 22: 'runendencoded', 23: 'binaryview', 24: 'utf8view', 25: 'listview', 26: 'largelistview' };
function arrowField(fb, t) {
  const tt = fb.u8(t, 2), tp = fb.tbl(t, 3), f = { name: fb.str(t, 0) ?? '', nullable: fb.bool(t, 1), kind: ARROW_TYPES[tt] || 'unknown(' + tt + ')', children: [], meta: {} };
  if (f.kind === 'int') { f.bits = fb.i32(tp, 0); f.signed = fb.bool(tp, 1); } else if (f.kind === 'float') f.prec = fb.i16(tp, 0);
  else if (f.kind === 'date') f.unit = fb.i16(tp, 0, 1); else if (f.kind === 'time') { f.unit = fb.i16(tp, 0, 1); f.bits = fb.i32(tp, 1, 32); } else if (f.kind === 'timestamp') { f.unit = fb.i16(tp, 0); f.tz = fb.str(tp, 1); } else if (f.kind === 'duration') f.unit = fb.i16(tp, 0, 1);
  else if (f.kind === 'decimal') { f.precision = fb.i32(tp, 0); f.scale = fb.i32(tp, 1); f.bits = fb.i32(tp, 2, 128); } else if (f.kind === 'fixedsizebinary') f.width = fb.i32(tp, 0); else if (f.kind === 'fixedsizelist') f.width = fb.i32(tp, 0);
  const de = fb.tbl(t, 4); if (de) { const it = fb.tbl(de, 1); f.dict = { id: fb.i64(de, 0), index: it ? { bits: fb.i32(it, 0, 32), signed: fb.bool(it, 1, true) } : { bits: 32, signed: true } }; }
  const ch = fb.vec(t, 5); for (let k = 0; k < ch.n; k++) f.children.push(arrowField(fb, ch.at(k)));
  const cm = fb.vec(t, 6); for (let k = 0; k < cm.n; k++) { const e = cm.at(k); f.meta[fb.str(e, 0)] = fb.str(e, 1); }
  return f;
}
export function arrowTypeName(f) {
  const U = ['s', 'ms', 'us', 'ns'];
  let s = f.kind === 'int' ? (f.signed ? 'int' : 'uint') + f.bits : f.kind === 'float' ? ['float16', 'float32', 'float64'][f.prec] : f.kind === 'date' ? (f.unit ? 'date64[ms]' : 'date32[day]') : f.kind === 'time' ? `time${f.bits}[${U[f.unit]}]` : f.kind === 'timestamp' ? `timestamp[${U[f.unit]}${f.tz ? ', tz=' + f.tz : ''}]` : f.kind === 'duration' ? `duration[${U[f.unit]}]` : f.kind === 'decimal' ? `decimal${f.bits}(${f.precision}, ${f.scale})` : f.kind === 'fixedsizebinary' ? `fixed_size_binary[${f.width}]` : f.kind === 'list' ? `list<${arrowTypeName(f.children[0])}>` : f.kind === 'largelist' ? `large_list<${arrowTypeName(f.children[0])}>` : f.kind === 'fixedsizelist' ? `fixed_size_list<${arrowTypeName(f.children[0])}>[${f.width}]` : f.kind === 'struct' ? `struct<${f.children.map((c) => c.name + ': ' + arrowTypeName(c)).join(', ')}>` : f.kind === 'map' ? `map<${arrowTypeName(f.children[0].children[0])}, ${arrowTypeName(f.children[0].children[1])}>` : f.kind;
  if (f.dict) s = `dictionary<values=${s}, indices=${f.dict.index.signed ? 'int' : 'uint'}${f.dict.index.bits}>`;
  return s;
}
export function arrowRead(u8) {
  let p = 0; const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), ASC = (o, s) => [...s].every((c, i) => u8[o + i] === c.charCodeAt(0));
  if (ASC(0, 'ARROW1')) p = 8;
  else if (u8.length >= 4 && dv.getUint32(0, true) !== 0xffffffff && ASC(0, 'PAR1')) throw new Error('This is a Parquet file, not Arrow IPC. Use the Parquet tools.');
  const out = { schema: null, meta: {}, batches: [], dicts: new Map(), version: null, compressed: null };
  while (p + 4 <= u8.length) {
    let len = dv.getInt32(p, true); p += 4;
    if (len === -1) { if (p + 4 > u8.length) break; len = dv.getInt32(p, true); p += 4; }
    if (len <= 0) break;
    if (p + len > u8.length) throw new Error('Truncated Arrow message (file cut short?).');
    const meta = u8.subarray(p, p + len), fb = fbOf(meta), msg = fb.root(); p += len;
    const htype = fb.u8(msg, 1), header = fb.tbl(msg, 2), bodyLen = fb.i64(msg, 3);
    if (p + bodyLen > u8.length) throw new Error('Truncated Arrow record batch body.');
    const body = u8.subarray(p, p + bodyLen); p += bodyLen;
    if (htype === 1) {
      const fl = fb.vec(header, 1); out.schema = []; for (let k = 0; k < fl.n; k++) out.schema.push(arrowField(fb, fl.at(k)));
      const cm = fb.vec(header, 2); for (let k = 0; k < cm.n; k++) { const e = cm.at(k); out.meta[fb.str(e, 0)] = fb.str(e, 1); }
    } else if (htype === 2 || htype === 3) {
      const rb = htype === 2 ? fb.tbl(header, 1) : header, nv = fb.vec(rb, 1), bv = fb.vec(rb, 2), comp = fb.tbl(rb, 3);
      const rec = { length: fb.i64(rb, 0), nodes: [], buffers: [], body, codec: comp ? fb.i8(comp, 0) : -1 };
      for (let k = 0; k < nv.n; k++) rec.nodes.push({ length: Number(fb.dv.getBigInt64(nv.base + 16 * k, true)), nulls: Number(fb.dv.getBigInt64(nv.base + 16 * k + 8, true)) });
      for (let k = 0; k < bv.n; k++) rec.buffers.push({ off: Number(fb.dv.getBigInt64(bv.base + 16 * k, true)), len: Number(fb.dv.getBigInt64(bv.base + 16 * k + 8, true)) });
      if (htype === 2) out.dicts.set(fb.i64(header, 0), { rec, delta: fb.bool(header, 2) }); else out.batches.push(rec);
    }
  }
  if (!out.schema) throw new Error('No Arrow schema message found: this does not look like an Arrow IPC stream or file.');
  return out;
}
const arrowBuf = (rec, i) => {
  const b = rec.buffers[i]; if (!b) throw new Error('Arrow buffer index out of range.');
  let d = rec.body.subarray(b.off, b.off + b.len);
  if (rec.codec >= 0 && d.length) {
    const n = Number(new DataView(d.buffer, d.byteOffset, 8).getBigInt64(0, true));
    if (n === -1) return d.subarray(8);
    if (rec.codec === 0) return lz4FrameDecode(d.subarray(8), n);
    throw new Error('This file uses ZSTD buffer compression, which this tool cannot decode (LZ4 and uncompressed work). Re-save it without compression.');
  }
  return d;
};
function arrowColumn(field, rec, cur, dicts) {
  const dictSpec = field.dict; if (dictSpec) field = { ...field, kind: 'int', bits: dictSpec.index.bits, signed: dictSpec.index.signed, dict: null, children: [] };
  const node = rec.nodes[cur.n++], n = node.length, nextBuf = () => arrowBuf(rec, cur.b++);
  const valid = field.kind === 'null' ? null : (() => { const v = nextBuf(); if (!node.nulls || !v.length) return null; return (i) => (v[i >> 3] >> (i & 7)) & 1; })();
  const mk = (f) => Array.from({ length: n }, (_, i) => (valid && !valid(i) ? null : f(i)));
  const vdv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
  const num = (v) => (typeof v === 'bigint' ? (v >= -9007199254740991n && v <= 9007199254740991n ? Number(v) : v.toString()) : v);
  const half = (h) => { const e = (h >> 10) & 31, m = h & 1023, s = h & 0x8000 ? -1 : 1; return e === 0 ? s * 2 ** -14 * (m / 1024) : e === 31 ? (m ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + m / 1024); };
  let vals;
  switch (field.kind) {
    case 'null': vals = new Array(n).fill(null); break;
    case 'bool': { const d = nextBuf(); vals = mk((i) => !!((d[i >> 3] >> (i & 7)) & 1)); break; }
    case 'int': { const d = nextBuf(), v = vdv(d), w = field.bits >> 3; vals = mk((i) => num(w === 1 ? (field.signed ? v.getInt8(i) : v.getUint8(i)) : w === 2 ? (field.signed ? v.getInt16(i * 2, true) : v.getUint16(i * 2, true)) : w === 4 ? (field.signed ? v.getInt32(i * 4, true) : v.getUint32(i * 4, true)) : (field.signed ? v.getBigInt64(i * 8, true) : v.getBigUint64(i * 8, true)))); break; }
    case 'float': { const d = nextBuf(), v = vdv(d); vals = mk((i) => field.prec === 0 ? half(v.getUint16(i * 2, true)) : field.prec === 1 ? v.getFloat32(i * 4, true) : v.getFloat64(i * 8, true)); break; }
    case 'date': { const d = nextBuf(), v = vdv(d); vals = mk((i) => { const ms = field.unit ? Number(v.getBigInt64(i * 8, true)) : v.getInt32(i * 4, true) * 864e5; return new Date(ms).toISOString().slice(0, 10); }); break; }
    case 'time': case 'duration': case 'timestamp': {
      const d = nextBuf(), v = vdv(d), w64 = field.kind !== 'time' || field.bits === 64, U = ['s', 'ms', 'us', 'ns'][field.unit];
      vals = mk((i) => {
        const raw = w64 ? v.getBigInt64(i * 8, true) : BigInt(v.getInt32(i * 4, true));
        if (field.kind === 'timestamp') { const ms = field.unit === 0 ? raw * 1000n : field.unit === 1 ? raw : field.unit === 2 ? raw / 1000n : raw / 1000000n; const dd = new Date(Number(ms)); return isNaN(dd) ? raw.toString() + ' ' + U : dd.toISOString().replace('Z', field.tz ? 'Z' : ''); }
        if (field.kind === 'time') { const ns = raw * [1000000000n, 1000000n, 1000n, 1n][field.unit], s = Number(ns / 1000000000n), f = Number(ns % 1000000000n); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}${f ? '.' + String(f).padStart(9, '0').replace(/0+$/, '') : ''}`; }
        return num(raw) + ' ' + U;
      }); break;
    }
    case 'decimal': { const d = nextBuf(), v = vdv(d), w = field.bits >> 3; vals = mk((i) => { let x = 0n; for (let k = w - 8; k >= 0; k -= 8) x = (x << 64n) | v.getBigUint64(i * w + k, true); if (x >> BigInt(field.bits - 1)) x -= 1n << BigInt(field.bits); const neg = x < 0n; let s = (neg ? -x : x).toString().padStart(field.scale + 1, '0'); if (field.scale > 0) s = s.slice(0, -field.scale) + '.' + s.slice(-field.scale); return (neg ? '-' : '') + s; }); break; }
    case 'utf8': case 'binary': case 'largeutf8': case 'largebinary': {
      const wide = field.kind.startsWith('large'), ob = nextBuf(), data = nextBuf(), ov = vdv(ob), txt = field.kind.endsWith('utf8'), td = new TextDecoder();
      const off = (i) => (wide ? Number(ov.getBigInt64(i * 8, true)) : ov.getInt32(i * 4, true));
      vals = mk((i) => { const s = data.subarray(off(i), off(i + 1)); return txt ? td.decode(s) : [...s].map((x) => x.toString(16).padStart(2, '0')).join(''); }); break;
    }
    case 'fixedsizebinary': { const d = nextBuf(); vals = mk((i) => [...d.subarray(i * field.width, (i + 1) * field.width)].map((x) => x.toString(16).padStart(2, '0')).join('')); break; }
    case 'list': case 'largelist': case 'map': {
      const ov = vdv(nextBuf()), wide = field.kind === 'largelist', off = (i) => (wide ? Number(ov.getBigInt64(i * 8, true)) : ov.getInt32(i * 4, true));
      const child = arrowColumn(field.children[0], rec, cur, dicts);
      vals = mk((i) => child.slice(off(i), off(i + 1)));
      if (field.kind === 'map') vals = vals.map((l) => (l ? Object.fromEntries(l.map((e) => [String(Object.values(e)[0]), Object.values(e)[1]])) : l));
      break;
    }
    case 'fixedsizelist': { const child = arrowColumn(field.children[0], rec, cur, dicts); vals = mk((i) => child.slice(i * field.width, (i + 1) * field.width)); break; }
    case 'struct': { const cols = field.children.map((c) => arrowColumn(c, rec, cur, dicts)); vals = mk((i) => Object.fromEntries(field.children.map((c, k) => [c.name, cols[k][i]]))); break; }
    default: throw new Error(`Arrow type "${field.kind}" is not supported by this decoder.`);
  }
  if (dictSpec) { const dict = dicts.get(dictSpec.id); if (!dict) throw new Error('Dictionary batch missing for a dictionary-encoded column.'); return vals.map((x) => (x == null ? null : dict[x])); }
  return vals;
}
// Arrow stores a dictionary-encoded column as its index type; decode it as ints first, then map through the dictionary values.
export function arrowTable(parsed) {
  const { schema, batches, dicts } = parsed, cols = schema.map(() => []), dictVals = new Map();
  const dictField = new Map(); const scan = (f) => { if (f.dict) dictField.set(f.dict.id, f); f.children.forEach(scan); }; schema.forEach(scan);
  for (const [id, d] of dicts) { const f = dictField.get(id); if (!f) continue; const vf = { ...f, dict: null }; const cur = { n: 0, b: 0 }; const arr = arrowColumn(vf, d.rec, cur, dictVals); dictVals.set(id, d.delta && dictVals.has(id) ? dictVals.get(id).concat(arr) : arr); }
  for (const b of batches) { const cur = { n: 0, b: 0 }; schema.forEach((f, k) => { cols[k].push(...arrowColumn(f, b, cur, dictVals)); }); }
  return { names: schema.map((f) => f.name), cols, rows: cols[0]?.length ?? 0 };
}
D.push({
  id: 'arrow-ipc-viewer', cat: 'Data Models', title: 'Apache Arrow / Feather File Viewer (IPC Decoder)', inputs: 0,
  desc: 'Open an Arrow IPC stream, Arrow file or Feather v2 file in your browser: see the schema, metadata and rows (JSON or CSV), with dictionary columns and LZ4 compression handled. Hand-written decoder, nothing is uploaded.',
  file: { accept: '.arrow,.feather,.arrows,.ipc,application/vnd.apache.arrow.file,application/vnd.apache.arrow.stream' },
  opts: [{ id: 'format', label: 'Rows as', type: 'select', choices: ['JSON', 'CSV', 'Schema only'], def: 'JSON' }, { id: 'limit', label: 'Max rows shown', type: 'number', def: 100 }],
  run: async (_i, o, files) => {
    if (!files?.[0]) throw new Error('Choose an .arrow or .feather file.');
    const parsed = arrowRead(await u8of(files[0])), tab = arrowTable(parsed), lim = clamp(o.limit, 1, 100000);
    const head = [`Arrow IPC: ${parsed.schema.length} columns, ${tab.rows} rows in ${parsed.batches.length} record batch(es)${parsed.batches.some((b) => b.codec === 0) ? ', LZ4-compressed buffers' : ''}.`, '', 'Schema:', ...parsed.schema.map((f) => `  ${f.name}: ${arrowTypeName(f)}${f.nullable ? '' : ' not null'}`)];
    const mk = Object.entries(parsed.meta); if (mk.length) head.push('', 'Schema metadata:', ...mk.map(([k, v]) => `  ${k}: ${String(v).length > 300 ? String(v).slice(0, 300) + '...' : v}`));
    if (o.format === 'Schema only') return head.join('\n');
    const rows = Array.from({ length: Math.min(lim, tab.rows) }, (_, i) => Object.fromEntries(tab.names.map((n, k) => [n, tab.cols[k][i]])));
    const flat = (v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v);
    let body;
    if (o.format === 'CSV') { const c = (v) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }; body = [tab.names.map(c).join(','), ...rows.map((r) => tab.names.map((n) => c(r[n])).join(','))].join('\n'); }
    else body = JSON.stringify(rows, (_k, v) => flat(v), 2);
    return { text: head.join('\n') + `\n\nRows ${rows.length ? 1 : 0} to ${rows.length} of ${tab.rows}:\n` + body, filename: o.format === 'CSV' ? 'arrow-rows.csv' : 'arrow-rows.json' };
  },
});

// =====================================================================================================
// GeoTIFF viewer: TIFF / BigTIFF reader (classic, tiled, striped, planar), GeoKey directory, pixel size / origin / bounding box,
// raster statistics and a PNG preview. Codecs: none, LZW, Deflate (platform DecompressionStream), PackBits; predictor 2.
// Verified against rasterio / tifffile (georeferencing, nodata, band values) on files they wrote.
// Skipped: JPEG / WebP / ZSTD / CCITT / LERC compression, floating-point predictor (3), reprojection and datum shifts (coordinates are shown in the file's own CRS;
// only EPSG:4326 and 3857 get lat/lon), COG range reads, sub-byte samples (1/4 bit), GCP-only or RPC-only georeferencing (listed, not applied).
// =====================================================================================================
const TIFF_TYPES = { 1: ['u8', 1], 2: ['ascii', 1], 3: ['u16', 2], 4: ['u32', 4], 5: ['rat', 8], 6: ['i8', 1], 7: ['u8', 1], 8: ['i16', 2], 9: ['i32', 4], 10: ['srat', 8], 11: ['f32', 4], 12: ['f64', 8], 16: ['u64', 8], 17: ['i64', 8], 18: ['u64', 8] };
const TIFF_TAGS = { 254: 'NewSubfileType', 256: 'ImageWidth', 257: 'ImageLength', 258: 'BitsPerSample', 259: 'Compression', 262: 'PhotometricInterpretation', 266: 'FillOrder', 270: 'ImageDescription', 273: 'StripOffsets', 274: 'Orientation', 277: 'SamplesPerPixel', 278: 'RowsPerStrip', 279: 'StripByteCounts', 282: 'XResolution', 283: 'YResolution', 284: 'PlanarConfiguration', 296: 'ResolutionUnit', 305: 'Software', 306: 'DateTime', 317: 'Predictor', 320: 'ColorMap', 322: 'TileWidth', 323: 'TileLength', 324: 'TileOffsets', 325: 'TileByteCounts', 338: 'ExtraSamples', 339: 'SampleFormat', 33550: 'ModelPixelScale', 33922: 'ModelTiepoint', 34264: 'ModelTransformation', 34735: 'GeoKeyDirectory', 34736: 'GeoDoubleParams', 34737: 'GeoAsciiParams', 42112: 'GDAL_METADATA', 42113: 'GDAL_NODATA' };
const GEO_KEYS = { 1024: 'GTModelType', 1025: 'GTRasterType', 1026: 'GTCitation', 2048: 'GeographicType', 2049: 'GeogCitation', 2050: 'GeogGeodeticDatum', 2051: 'GeogPrimeMeridian', 2052: 'GeogLinearUnits', 2054: 'GeogAngularUnits', 2056: 'GeogEllipsoid', 2057: 'GeogSemiMajorAxis', 2058: 'GeogSemiMinorAxis', 2059: 'GeogInvFlattening', 3072: 'ProjectedCSType', 3073: 'PCSCitation', 3074: 'Projection', 3075: 'ProjCoordTrans', 3076: 'ProjLinearUnits', 3077: 'ProjStdParallel1', 3078: 'ProjStdParallel2', 3079: 'ProjNatOriginLong', 3080: 'ProjNatOriginLat', 3081: 'ProjFalseEasting', 3082: 'ProjFalseNorthing', 3083: 'ProjFalseOriginLong', 3084: 'ProjFalseOriginLat', 3088: 'ProjCenterLong', 3092: 'ProjScaleAtNatOrigin', 4096: 'VerticalCSType', 4097: 'VerticalCitation', 4099: 'VerticalUnits' };
const EPSG_NAMES = { 4326: 'WGS 84', 4269: 'NAD83', 4267: 'NAD27', 4258: 'ETRS89', 4230: 'ED50', 4283: 'GDA94', 7844: 'GDA2020', 3857: 'WGS 84 / Pseudo-Mercator', 3395: 'WGS 84 / World Mercator', 2154: 'RGF93 / Lambert-93', 27700: 'OSGB36 / British National Grid', 28992: 'Amersfoort / RD New', 31370: 'Belge 1972 / Belgian Lambert 72', 3035: 'ETRS89-extended / LAEA Europe', 5070: 'NAD83 / Conus Albers' };
export function epsgName(c) { if (EPSG_NAMES[c]) return EPSG_NAMES[c]; if (c >= 32601 && c <= 32660) return `WGS 84 / UTM zone ${c - 32600}N`; if (c >= 32701 && c <= 32760) return `WGS 84 / UTM zone ${c - 32700}S`; if (c >= 25828 && c <= 25838) return `ETRS89 / UTM zone ${c - 25800}N`; if (c >= 26901 && c <= 26923) return `NAD83 / UTM zone ${c - 26900}N`; if (c >= 32201 && c <= 32260) return `WGS 72 / UTM zone ${c - 32200}N`; return ''; }
export function tiffRead(u8) {
  if (u8.length < 8) throw new Error('File too small to be a TIFF.');
  const le = u8[0] === 0x49 && u8[1] === 0x49; if (!le && !(u8[0] === 0x4d && u8[1] === 0x4d)) throw new Error('Not a TIFF file (byte order mark II or MM not found).');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), m = dv.getUint16(2, le); if (m !== 42 && m !== 43) throw new Error('Not a TIFF file (magic number ' + m + ').');
  const big = m === 43, off64 = (o) => Number(dv.getBigUint64(o, le)), ptr = (o) => (big ? off64(o) : dv.getUint32(o, le)), psz = big ? 8 : 4;
  if (big && (dv.getUint16(4, le) !== 8)) throw new Error('Unsupported BigTIFF offset size.');
  const ifds = []; let next = big ? off64(8) : dv.getUint32(4, le); const seen = new Set();
  while (next && !seen.has(next) && next + 2 <= u8.length && ifds.length < 64) {
    seen.add(next);
    const n = big ? off64(next) : dv.getUint16(next, le), esz = big ? 20 : 12, base = next + (big ? 8 : 2), tags = {};
    if (base + n * esz > u8.length) throw new Error('IFD runs past the end of the file (truncated TIFF).');
    for (let i = 0; i < n; i++) {
      const e = base + i * esz, id = dv.getUint16(e, le), ty = dv.getUint16(e + 2, le), cnt = big ? off64(e + 4) : dv.getUint32(e + 4, le), info = TIFF_TYPES[ty]; if (!info) continue;
      const size = cnt * info[1], at = e + (big ? 12 : 8), o = size <= psz ? at : ptr(at); if (o + size > u8.length) continue;
      let v;
      if (info[0] === 'ascii') v = new TextDecoder().decode(u8.subarray(o, o + cnt)).replace(/\0+$/, '');
      else { v = new Array(cnt); for (let k = 0; k < cnt; k++) { const p = o + k * info[1]; v[k] = info[0] === 'u8' ? u8[p] : info[0] === 'i8' ? dv.getInt8(p) : info[0] === 'u16' ? dv.getUint16(p, le) : info[0] === 'i16' ? dv.getInt16(p, le) : info[0] === 'u32' ? dv.getUint32(p, le) : info[0] === 'i32' ? dv.getInt32(p, le) : info[0] === 'f32' ? dv.getFloat32(p, le) : info[0] === 'f64' ? dv.getFloat64(p, le) : info[0] === 'rat' ? dv.getUint32(p, le) / (dv.getUint32(p + 4, le) || 1) : info[0] === 'srat' ? dv.getInt32(p, le) / (dv.getInt32(p + 4, le) || 1) : off64(p); } }
      tags[id] = v;
    }
    ifds.push({ tags, offset: next }); next = ptr(base + n * esz);
  }
  if (!ifds.length) throw new Error('No image directory found in this TIFF.');
  return { le, big, ifds, dv };
}
export function geoInfo(tags) {
  const g = {}, kd = tags[34735]; if (!kd) return null;
  const dbl = tags[34736] || [], asc = tags[34737] || '', nk = kd[3];
  for (let i = 0; i < nk; i++) { const [id, loc, cnt, val] = kd.slice(4 + i * 4, 8 + i * 4); g[GEO_KEYS[id] || 'key' + id] = loc === 0 ? val : loc === 34736 ? (cnt === 1 ? dbl[val] : dbl.slice(val, val + cnt)) : loc === 34737 ? asc.slice(val, val + cnt).replace(/\|$/, '') : val; }
  const px = tags[33550], tp = tags[33922], tm = tags[34264], w = tags[256][0], h = tags[257][0], pointPix = g.GTRasterType === 2;
  let T = null; // affine: x = a*col + b*row + c ; y = d*col + e*row + f  (col,row refer to pixel corner)
  if (tm && tm.length >= 16) T = [tm[0], tm[1], tm[3], tm[4], tm[5], tm[7]];
  else if (px && tp && tp.length >= 6) { const [i, j, , X, Y] = tp; T = [px[0], 0, X - i * px[0], 0, -px[1], Y + j * px[1]]; }
  if (T && pointPix) { T[2] -= 0.5 * T[0] + 0.5 * T[1]; T[5] -= 0.5 * T[3] + 0.5 * T[4]; }
  const at = (c, r) => (T ? [T[0] * c + T[1] * r + T[2], T[3] * c + T[4] * r + T[5]] : null);
  const epsg = g.ProjectedCSType && g.ProjectedCSType !== 32767 ? g.ProjectedCSType : g.GeographicType && g.GeographicType !== 32767 ? g.GeographicType : null;
  return { keys: g, epsg, epsgName: epsg ? epsgName(epsg) : '', transform: T, corners: T ? { nw: at(0, 0), ne: at(w, 0), sw: at(0, h), se: at(w, h), centre: at(w / 2, h / 2) } : null, pixelIsPoint: pointPix, pixelSize: T ? [Math.hypot(T[0], T[3]), Math.hypot(T[1], T[4])] : null, gcps: tp && tp.length > 6 && !px ? tp.length / 6 : 0 };
}
const mercToLonLat = ([x, y]) => [x / 6378137 * 180 / Math.PI, (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI];
const inflate = async (b) => new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
function packBits(src, outLen) { const out = new Uint8Array(outLen); let i = 0, o = 0; while (i < src.length && o < outLen) { const n = (src[i++] << 24) >> 24; if (n >= 0) { for (let k = 0; k <= n && o < outLen; k++) out[o++] = src[i++]; } else if (n !== -128) { const c = src[i++]; for (let k = 0; k < 1 - n && o < outLen; k++) out[o++] = c; } } return out; }
function lzwTiff(src, outLen) { // TIFF LZW: MSB-first, codes 9..12 bits, "early change"
  const out = new Uint8Array(outLen); let o = 0, bits = 0, acc = 0, ip = 0, w = 9;
  let tbl = [], reset = () => { tbl = []; for (let i = 0; i < 256; i++) tbl.push([i]); tbl.push(null, null); w = 9; };
  const read = () => { while (bits < w) { if (ip >= src.length) return 257; acc = (acc << 8) | src[ip++]; bits += 8; } const c = (acc >> (bits - w)) & ((1 << w) - 1); bits -= w; acc &= (1 << bits) - 1; return c; };
  reset(); let prev = null;
  for (;;) {
    const c = read(); if (c === 257) break;
    if (c === 256) { reset(); prev = null; continue; }
    let e; if (c < tbl.length) e = tbl[c]; else if (prev) e = prev.concat(prev[0]); else throw new Error('LZW data is corrupt.');
    if (prev) tbl.push(prev.concat(e[0]));
    for (let k = 0; k < e.length && o < outLen; k++) out[o++] = e[k];
    prev = e; w = tbl.length >= 2047 ? 12 : tbl.length >= 1023 ? 11 : tbl.length >= 511 ? 10 : 9;
    if (o >= outLen) break;
  }
  return out;
}
export async function tiffDecode(file, ifd, { maxPixels = 40e6 } = {}) {
  const t = ifd.tags, le = file.le, W = t[256][0], H = t[257][0], spp = (t[277] || [1])[0], bps = (t[258] || [1]), comp = (t[259] || [1])[0], planar = (t[284] || [1])[0], pred = (t[317] || [1])[0], fmt = (t[339] || [1])[0];
  if (W * H * spp > maxPixels) throw new Error(`Image is ${W} x ${H} x ${spp}; this viewer decodes at most ${maxPixels / 1e6} million samples in the browser.`);
  if (new Set(bps).size !== 1 || ![8, 16, 32, 64].includes(bps[0])) throw new Error(`Sample size ${bps.join('/')} bits is not supported (8, 16, 32 and 64 bit samples are).`);
  if (![1, 5, 8, 32946, 32773].includes(comp)) throw new Error(`Compression ${comp} (${{ 7: 'JPEG', 34712: 'JPEG 2000', 50000: 'ZSTD', 34925: 'LZMA', 50001: 'WebP', 34887: 'LERC', 4: 'CCITT G4' }[comp] || 'unknown'}) is not supported. LZW, Deflate, PackBits and uncompressed are.`);
  if (pred === 3) throw new Error('The floating-point predictor (3) is not supported.'); if (pred !== 1 && pred !== 2) throw new Error('Unknown predictor ' + pred);
  const tiled = !!t[322], tw = tiled ? t[322][0] : W, th = tiled ? t[323][0] : Math.min((t[278] || [H])[0], H), offs = tiled ? t[324] : t[273], cnts = tiled ? t[325] : t[279];
  if (!offs || !cnts) throw new Error('Missing strip / tile offsets.');
  const B = bps[0] >> 3, TA = fmt === 3 ? (B === 4 ? Float32Array : Float64Array) : fmt === 2 ? ({ 1: Int8Array, 2: Int16Array, 4: Int32Array, 8: BigInt64Array }[B]) : ({ 1: Uint8Array, 2: Uint16Array, 4: Uint32Array, 8: BigUint64Array }[B]);
  if (fmt === 3 && B < 4) throw new Error('Half-precision float TIFFs are not supported.'); if (B === 8 && fmt !== 3) throw new Error('64-bit integer TIFF samples are not supported.');
  const data = new TA(W * H * spp), chunkSpp = planar === 2 ? 1 : spp, across = Math.ceil(W / tw), down = Math.ceil(H / th), perPlane = across * down, nChunks = perPlane * (planar === 2 ? spp : 1);
  if (offs.length < nChunks) throw new Error('Fewer strips/tiles than the image needs (corrupt file).');
  for (let c = 0; c < nChunks; c++) {
    const plane = planar === 2 ? Math.floor(c / perPlane) : 0, k = c % perPlane, tx = (k % across) * tw, ty = Math.floor(k / across) * th, rowsHere = tiled ? th : Math.min(th, H - ty), need = tw * rowsHere * chunkSpp * B;
    if (offs[c] + cnts[c] > file.dv.byteLength) throw new Error('Strip/tile data runs past the end of the file (truncated).');
    let raw = new Uint8Array(file.dv.buffer, file.dv.byteOffset + offs[c], cnts[c]);
    raw = comp === 1 ? raw : comp === 5 ? lzwTiff(raw, need) : comp === 32773 ? packBits(raw, need) : await inflate(raw);
    if (raw.length < need) { const g = new Uint8Array(need); g.set(raw); raw = g; }
    const chunk = new TA(need / B), cdv = new DataView(raw.buffer, raw.byteOffset, need);
    const rd = fmt === 3 ? (B === 4 ? (o) => cdv.getFloat32(o, le) : (o) => cdv.getFloat64(o, le)) : fmt === 2 ? (B === 1 ? (o) => cdv.getInt8(o) : B === 2 ? (o) => cdv.getInt16(o, le) : (o) => cdv.getInt32(o, le)) : (B === 1 ? (o) => cdv.getUint8(o) : B === 2 ? (o) => cdv.getUint16(o, le) : (o) => cdv.getUint32(o, le));
    for (let i = 0; i < chunk.length; i++) chunk[i] = rd(i * B);
    if (pred === 2) for (let r = 0; r < rowsHere; r++) for (let x = 1; x < tw; x++) for (let s = 0; s < chunkSpp; s++) { const i = (r * tw + x) * chunkSpp + s; chunk[i] = chunk[i] + chunk[i - chunkSpp]; }
    for (let r = 0; r < rowsHere && ty + r < H; r++) for (let x = 0; x < tw && tx + x < W; x++) for (let s = 0; s < chunkSpp; s++) data[((ty + r) * W + tx + x) * spp + (planar === 2 ? plane : s)] = chunk[(r * tw + x) * chunkSpp + s];
  }
  return { width: W, height: H, spp, bits: bps[0], fmt, data };
}
function tiffPreview(img, tags, band, mode) { // RGBA preview, at most 2000 px on a side
  const { width: W, height: H, spp, data } = img, nodata = tags[42113] != null ? parseFloat(tags[42113]) : null, ph = (tags[262] || [1])[0], step = Math.max(1, Math.ceil(Math.max(W, H) / 2000));
  const w = Math.ceil(W / step), h = Math.ceil(H / step), rgba = new Uint8ClampedArray(w * h * 4), rgb = (ph === 2 && spp >= 3) || (spp >= 3 && ph !== 3), pal = ph === 3 ? tags[320] : null;
  const ext = (tags[338] || []).length, hasAlpha = rgb && spp >= 4 && (tags[338] || [])[0] >= 1, bands = rgb ? [0, 1, 2] : [clamp(band, 1, spp) - 1];
  const sample = new Float64Array(w * h * bands.length); let lo = Infinity, hi = -Infinity; const vals = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bands.forEach((b, k) => { const v = Number(data[((y * step) * W + x * step) * spp + b]); sample[(y * w + x) * bands.length + k] = v; if (!rgb && (nodata == null || v !== nodata) && Number.isFinite(v)) { vals.push(v); if (v < lo) lo = v; if (v > hi) hi = v; } });
  void ext;
  if (!rgb && mode !== 'min-max' && vals.length > 20) { vals.sort((a, b) => a - b); lo = vals[Math.floor(vals.length * 0.02)]; hi = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.98))]; }
  if (!(hi > lo)) hi = lo + 1;
  for (let i = 0; i < w * h; i++) {
    if (rgb) { const f = data instanceof Uint8Array ? 1 : 255 / (data instanceof Uint16Array ? 65535 : Math.max(1, hi)); for (let k = 0; k < 3; k++) rgba[i * 4 + k] = sample[i * 3 + k] * (data instanceof Uint8Array ? 1 : data instanceof Uint16Array ? 255 / 65535 : f); rgba[i * 4 + 3] = hasAlpha ? Number(data[(Math.floor(i / w) * step * W + (i % w) * step) * spp + 3]) * (data instanceof Uint8Array ? 1 : 255 / 65535) : 255; continue; }
    const v = sample[i]; if ((nodata != null && v === nodata) || !Number.isFinite(v)) { rgba[i * 4 + 3] = 0; continue; }
    if (pal) { const n = pal.length / 3, idx = Math.min(n - 1, Math.max(0, v | 0)); for (let k = 0; k < 3; k++) rgba[i * 4 + k] = pal[k * n + idx] >> 8; rgba[i * 4 + 3] = 255; continue; }
    let g = Math.max(0, Math.min(1, (v - lo) / (hi - lo))); if (ph === 0) g = 1 - g; rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = g * 255; rgba[i * 4 + 3] = 255;
  }
  return { rgba, w, h, lo, hi };
}
async function rgbaToPng(rgba, w, h) {
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  cv.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  return cv.convertToBlob ? cv.convertToBlob({ type: 'image/png' }) : new Promise((res) => cv.toBlob(res, 'image/png'));
}
export async function geotiffReport(u8, { band = 1, stretch = '2-98 percent', decode = true } = {}) {
  const f = tiffRead(u8), main = f.ifds[0], t = main.tags, L = [], fmtName = (fmt, bits) => (fmt === 3 ? 'float' : fmt === 2 ? 'int' : 'uint') + bits;
  const spp = (t[277] || [1])[0], bps = (t[258] || [1])[0], fmt = (t[339] || [1])[0], comp = (t[259] || [1])[0], ph = (t[262] || [1])[0];
  L.push(`TIFF${f.big ? ' (BigTIFF)' : ''}, ${f.le ? 'little' : 'big'}-endian, ${f.ifds.length} image director${f.ifds.length === 1 ? 'y' : 'ies'}`, `Size: ${t[256][0]} x ${t[257][0]} px, ${spp} band(s), ${fmtName(fmt, bps)}, photometric ${['min-is-white', 'min-is-black', 'RGB', 'palette'][ph] ?? ph}`,
    `Layout: ${t[322] ? `tiled ${t[322][0]} x ${t[323][0]}` : `striped, ${(t[278] || ['all'])[0]} rows per strip`}, ${(t[284] || [1])[0] === 2 ? 'planar' : 'interleaved'}, compression ${({ 1: 'none', 5: 'LZW', 8: 'Deflate', 32946: 'Deflate', 32773: 'PackBits', 7: 'JPEG', 50000: 'ZSTD', 34925: 'LZMA' })[comp] ?? comp}${(t[317] || [1])[0] > 1 ? ', predictor ' + t[317][0] : ''}`);
  if (f.ifds.length > 1) L.push('Other directories: ' + f.ifds.slice(1).map((d, i) => `#${i + 2} ${d.tags[256]?.[0]}x${d.tags[257]?.[0]}${(d.tags[254]?.[0] & 1) ? ' (reduced-resolution overview)' : (d.tags[254]?.[0] & 4) ? ' (mask)' : ''}`).join(', '));
  const geo = geoInfo(t);
  if (!geo) L.push('', 'No GeoTIFF tags (GeoKeyDirectory missing): this is a plain TIFF.'); else {
    L.push('', 'Georeferencing:'); if (geo.epsg) L.push(`  CRS: EPSG:${geo.epsg}${geo.epsgName ? ' (' + geo.epsgName + ')' : ''}${geo.keys.GTModelType ? ', model type ' + ({ 1: 'projected', 2: 'geographic', 3: 'geocentric' }[geo.keys.GTModelType] || geo.keys.GTModelType) : ''}`);
    else L.push('  CRS: not an EPSG code (user-defined or missing); see the GeoKeys below.');
    L.push(`  Pixel is ${geo.pixelIsPoint ? 'point (cell centres, shifted by half a pixel)' : 'area (standard)'}`);
    if (geo.transform) {
      const ll = geo.epsg === 3857 ? mercToLonLat : (geo.epsg === 4326 || geo.keys.GTModelType === 2) ? (p) => p : null, fmt2 = (p) => p.map((x) => +x.toFixed(6)).join(', ');
      L.push(`  Pixel size: ${geo.pixelSize.map((x) => +x.toPrecision(10)).join(' x ')} (CRS units)`, `  Affine (x = a*col + b*row + c, y = d*col + e*row + f): ${geo.transform.map((x) => +x.toPrecision(12)).join(', ')}`);
      for (const [k, p] of Object.entries(geo.corners)) L.push(`  ${k.padEnd(6)} ${fmt2(p)}${ll ? '   lon, lat = ' + fmt2(ll(p)) : ''}`);
      if (!ll) L.push('  (lon/lat is only computed for EPSG:4326 and 3857; other projections need a projection library)');
    } else L.push(geo.gcps ? `  ${geo.gcps} ground control points, no affine transform (GCP georeferencing is listed but not applied)` : '  No pixel-to-world transform.');
    L.push('  GeoKeys: ' + Object.entries(geo.keys).map(([k, v]) => `${k}=${typeof v === 'string' ? JSON.stringify(v) : v}`).join('; '));
  }
  if (t[42113] != null) L.push('', 'NoData: ' + t[42113]); if (t[42112]) L.push('GDAL metadata: ' + String(t[42112]).replace(/\s+/g, ' ').slice(0, 400));
  if (t[270]) L.push('Description: ' + t[270]); if (t[305]) L.push('Software: ' + t[305]);
  let blob = null;
  if (decode) {
    try {
      const img = await tiffDecode(f, main), nodata = t[42113] != null ? parseFloat(t[42113]) : null;
      L.push('', 'Band statistics (valid pixels):');
      for (let b = 0; b < img.spp; b++) { let mn = Infinity, mx = -Infinity, sum = 0, n = 0, nd = 0; for (let i = b; i < img.data.length; i += img.spp) { const v = Number(img.data[i]); if (v === nodata || Number.isNaN(v)) { nd++; continue; } if (v < mn) mn = v; if (v > mx) mx = v; sum += v; n++; } L.push(`  band ${b + 1}: min ${mn} max ${mx} mean ${n ? +(sum / n).toPrecision(8) : 'n/a'} valid ${n}${nd ? ' nodata ' + nd : ''}`); }
      const pv = tiffPreview(img, t, band, stretch === 'min-max' ? 'min-max' : 'pct'); try { blob = await rgbaToPng(pv.rgba, pv.w, pv.h); } catch { L.push('(PNG preview needs a browser canvas)'); }
      L.push(`Preview ${pv.w} x ${pv.h} px${img.spp >= 3 && ph !== 3 ? ' (bands 1-3 as RGB)' : `, band ${clamp(band, 1, img.spp)} stretched ${pv.lo} to ${pv.hi}`}.`);
    } catch (e) { L.push('', 'Pixels not decoded: ' + e.message); }
  }
  return { text: L.join('\n'), blob };
}
D.push({
  id: 'geotiff-viewer', cat: IMGC, title: 'GeoTIFF Viewer: Georeferencing, Tags and Raster Preview', inputs: 0, dom: true,
  desc: 'Open a GeoTIFF (or any TIFF / BigTIFF) in your browser: CRS (EPSG), pixel size, bounding box, tags, NoData, band statistics and a PNG preview of the raster. LZW, Deflate and PackBits supported. Hand-written reader; nothing is uploaded.',
  file: { accept: '.tif,.tiff,.gtif,image/tiff' },
  opts: [{ id: 'band', label: 'Band to preview (single-band rasters)', type: 'number', def: 1 }, { id: 'stretch', label: 'Contrast stretch', type: 'select', choices: ['2-98 percent', 'min-max'], def: '2-98 percent' }, { id: 'decode', label: 'Decode pixels (statistics and preview)', type: 'checkbox', def: true }],
  run: async (_i, o, files) => {
    if (!files?.[0]) throw new Error('Choose a .tif / .tiff file.');
    const r = await geotiffReport(await u8of(files[0]), { band: o.band, stretch: o.stretch, decode: o.decode !== false });
    return r.blob ? { text: r.text, blob: [r.blob], filename: 'geotiff-preview.png' } : r.text;
  },
});

// =====================================================================================================
// TrueType font subsetter. Keeps the glyphs for the characters you list (plus composite-glyph components and .notdef), renumbers glyphs,
// rebuilds glyf / loca / hmtx / cmap / post / maxp / hhea / head, drops the rest, outputs TTF or WOFF. Input: TrueType (glyf) .ttf, or WOFF 1.
// Verified against fontTools (cmap, glyph outlines, advances, side bearings) and by rendering original vs subset with FreeType via Pillow.
// Skipped: CFF / OpenType-PostScript fonts (.otf with CFF), variable fonts, WOFF2 (needs Brotli), TrueType collections, OpenType layout
// (GSUB / GPOS / kern are dropped, so ligatures, kerning and contextual forms are lost), vertical metrics, hinting-program pruning
// (fpgm / prep / cvt are kept as they are), colour fonts, and updating OS/2 unicode ranges. Check the licence of the font: many forbid subsetting or embedding.
// =====================================================================================================
const fontTag = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
async function fontTables(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), tag = fontTag(dv, 0), tabs = {};
  if (tag === 'wOF2') throw new Error('WOFF2 fonts use Brotli compression, which browsers cannot decompress to this tool. Convert it to TTF or WOFF first.');
  if (tag === 'ttcf') throw new Error('TrueType collections (.ttc) are not supported; extract one font first.');
  if (tag === 'OTTO') throw new Error('This is an OpenType font with CFF outlines. Only TrueType (glyf) fonts can be subset here.');
  if (tag === 'wOFF') {
    const n = dv.getUint16(12);
    for (let i = 0; i < n; i++) { const e = 44 + i * 20, t = fontTag(dv, e), off = dv.getUint32(e + 4), cl = dv.getUint32(e + 8), ol = dv.getUint32(e + 12), raw = u8.subarray(off, off + cl); tabs[t] = cl < ol ? await inflate(raw) : raw.slice(); if (tabs[t].length !== ol) throw new Error('WOFF table ' + t + ' has the wrong length after decompression.'); }
    return tabs;
  }
  if (dv.getUint32(0) !== 0x00010000 && tag !== 'true') throw new Error('Not a TrueType font (unknown signature).');
  const n = dv.getUint16(4);
  for (let i = 0; i < n; i++) { const e = 12 + i * 16, off = dv.getUint32(e + 8), len = dv.getUint32(e + 12); if (off + len > u8.length) throw new Error('Table ' + fontTag(dv, e) + ' runs past the end of the file.'); tabs[fontTag(dv, e)] = u8.slice(off, off + len); }
  return tabs;
}
function cmapLookup(cm) { // returns Map codepoint -> gid from the best Unicode subtable
  const dv = new DataView(cm.buffer, cm.byteOffset, cm.byteLength), n = dv.getUint16(2), subs = [];
  for (let i = 0; i < n; i++) subs.push({ pid: dv.getUint16(4 + i * 8), eid: dv.getUint16(6 + i * 8), off: dv.getUint32(8 + i * 8) });
  const score = (s) => (s.pid === 3 && s.eid === 10 ? 4 : s.pid === 0 && (s.eid === 4 || s.eid === 6) ? 4 : s.pid === 3 && s.eid === 1 ? 3 : s.pid === 0 ? 2 : s.pid === 3 && s.eid === 0 ? 0 : -1);
  const best = subs.filter((s) => score(s) >= 0).sort((a, b) => score(b) - score(a));
  if (!best.length) throw new Error('The font has no Unicode cmap subtable.');
  const map = new Map(), pick = best[0], fmt = dv.getUint16(pick.off), o = pick.off;
  if (fmt === 4) {
    const sc = dv.getUint16(o + 6) / 2, endO = o + 14, startO = endO + sc * 2 + 2, deltaO = startO + sc * 2, rangeO = deltaO + sc * 2;
    for (let s = 0; s < sc; s++) { const end = dv.getUint16(endO + s * 2), start = dv.getUint16(startO + s * 2), delta = dv.getInt16(deltaO + s * 2), ro = dv.getUint16(rangeO + s * 2); for (let c = start; c <= end && c !== 0xffff; c++) { let g; if (ro === 0) g = (c + delta) & 0xffff; else { const p = rangeO + s * 2 + ro + (c - start) * 2; if (p + 2 > cm.length) continue; g = dv.getUint16(p); if (g) g = (g + delta) & 0xffff; } if (g) map.set(c, g); } }
  } else if (fmt === 12) { const ng = dv.getUint32(o + 12); for (let k = 0; k < ng; k++) { const b = o + 16 + k * 12, s = dv.getUint32(b), e = dv.getUint32(b + 4), g = dv.getUint32(b + 8); if (e - s > 0x110000) continue; for (let c = s; c <= e; c++) if (g + c - s) map.set(c, g + c - s); } }
  else if (fmt === 6) { const first = dv.getUint16(o + 6), cnt = dv.getUint16(o + 8); for (let k = 0; k < cnt; k++) { const g = dv.getUint16(o + 10 + k * 2); if (g) map.set(first + k, g); } }
  else if (fmt === 0) { for (let c = 0; c < 256; c++) { const g = dv.getUint8(o + 6 + c); if (g) map.set(c, g); } }
  else throw new Error('Unsupported cmap format ' + fmt + '.');
  return map;
}
function buildCmap(pairs) { // pairs: sorted [codepoint, newGid]
  const bmp = pairs.filter(([c]) => c < 0xffff), segs = [];
  for (const [c, g] of bmp) { const l = segs[segs.length - 1]; if (l && c === l.end + 1 && g === l.g0 + (c - l.start)) l.end = c; else segs.push({ start: c, end: c, g0: g }); }
  segs.push({ start: 0xffff, end: 0xffff, g0: 0xffff - 1 + 0 }); // final segment maps 0xFFFF to gid 0 via delta 1
  const sc = segs.length, len = 16 + sc * 8, f4 = new DataView(new ArrayBuffer(len)), sr = 2 * 2 ** Math.floor(Math.log2(sc));
  f4.setUint16(0, 4); f4.setUint16(2, len); f4.setUint16(6, sc * 2); f4.setUint16(8, sr); f4.setUint16(10, Math.log2(sr / 2)); f4.setUint16(12, sc * 2 - sr);
  segs.forEach((s, i) => { f4.setUint16(14 + i * 2, s.end); f4.setUint16(16 + sc * 2 + i * 2, s.start); f4.setInt16(16 + sc * 4 + i * 2, i === sc - 1 ? 1 : (s.g0 - s.start) << 16 >> 16); f4.setUint16(16 + sc * 6 + i * 2, 0); });
  const subs = [{ p: 3, e: 1, d: new Uint8Array(f4.buffer) }];
  if (pairs.some(([c]) => c > 0xffff)) {
    const gr = []; for (const [c, g] of pairs) { const l = gr[gr.length - 1]; if (l && c === l.end + 1 && g === l.g0 + (c - l.start)) l.end = c; else gr.push({ start: c, end: c, g0: g }); }
    const f12 = new DataView(new ArrayBuffer(16 + gr.length * 12)); f12.setUint16(0, 12); f12.setUint32(4, 16 + gr.length * 12); f12.setUint32(12, gr.length); gr.forEach((s, i) => { f12.setUint32(16 + i * 12, s.start); f12.setUint32(20 + i * 12, s.end); f12.setUint32(24 + i * 12, s.g0); });
    subs.unshift({ p: 3, e: 10, d: new Uint8Array(f12.buffer) }); subs.push({ p: 0, e: 4, d: subs[0].d });
  } else subs.push({ p: 0, e: 3, d: subs[0].d });
  const recs = subs.length, uniq = [...new Set(subs.map((s) => s.d))], offs = new Map(); let off = 4 + recs * 8; for (const d of uniq) { offs.set(d, off); off += d.length + ((4 - (d.length % 4)) % 4); }
  const out = new DataView(new ArrayBuffer(off)); out.setUint16(2, recs);
  subs.sort((a, b) => a.p - b.p || a.e - b.e).forEach((s, i) => { out.setUint16(4 + i * 8, s.p); out.setUint16(6 + i * 8, s.e); out.setUint32(8 + i * 8, offs.get(s.d)); });
  for (const d of uniq) new Uint8Array(out.buffer).set(d, offs.get(d));
  return new Uint8Array(out.buffer);
}
const sfntSum = (b) => { let s = 0; const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); for (let i = 0; i + 4 <= b.length; i += 4) s = (s + dv.getUint32(i)) >>> 0; const r = b.length % 4; if (r) { let v = 0; for (let k = 0; k < 4; k++) v = v * 256 + (k < r ? b[b.length - r + k] : 0); s = (s + v) >>> 0; } return s; };
export function fontCodepoints(text, ranges, ascii) {
  const set = new Set(); for (const ch of String(text || '')) { const c = ch.codePointAt(0); if (c >= 32 || c === 9) set.add(c); }
  for (const part of String(ranges || '').split(/[,\s]+/).filter(Boolean)) { const m = /^(?:U\+)?([0-9a-f]{1,6})(?:\s*-\s*(?:U\+)?([0-9a-f]{1,6}))?$/i.exec(part); if (!m) throw new Error(`Cannot read the range "${part}" (use U+0041-005A or U+00E9).`); const a = parseInt(m[1], 16), b = m[2] ? parseInt(m[2], 16) : a; if (b < a || b - a > 70000) throw new Error('Range too large: ' + part); for (let c = a; c <= b; c++) set.add(c); }
  if (ascii) for (let c = 32; c < 127; c++) set.add(c);
  return set;
}
export async function ttfSubset(u8, codepoints, { outFormat = 'TTF' } = {}) {
  const T = await fontTables(u8);
  for (const t of ['head', 'hhea', 'maxp', 'hmtx', 'cmap', 'loca', 'glyf']) if (!T[t]) throw new Error(T.CFF || T['CFF2'] ? 'CFF-based OpenType font: only TrueType (glyf) fonts are supported.' : `The font has no "${t}" table (is it a TrueType font with outlines?).`);
  if (T.fvar) throw new Error('Variable fonts (fvar) are not supported: subsetting would also have to rewrite gvar / avar / STAT.');
  const head = new DataView(T.head.buffer, T.head.byteOffset, T.head.byteLength), locaLong = head.getInt16(50), maxp = new DataView(T.maxp.buffer, T.maxp.byteOffset, T.maxp.byteLength), nGlyphs = maxp.getUint16(4);
  const hhea = new DataView(T.hhea.buffer, T.hhea.byteOffset, T.hhea.byteLength), nHM = hhea.getUint16(34), loca = new DataView(T.loca.buffer, T.loca.byteOffset, T.loca.byteLength), glyf = T.glyf;
  const gOff = (g) => (locaLong ? loca.getUint32(g * 4) : loca.getUint16(g * 2) * 2), gSlice = (g) => { if (g >= nGlyphs) return new Uint8Array(0); const a = gOff(g), b = gOff(g + 1); if (b < a || b > glyf.length) throw new Error('Corrupt loca table.'); return glyf.subarray(a, b); };
  const cmap = cmapLookup(T.cmap), keep = new Set([0]), missing = [], chosen = [];
  for (const c of [...codepoints].sort((a, b) => a - b)) { const g = cmap.get(c); if (g === undefined || g >= nGlyphs) { missing.push(c); continue; } chosen.push([c, g]); keep.add(g); }
  if (!chosen.length) throw new Error('None of the requested characters exist in this font.');
  const queue = [...keep]; const comps = new Map();
  while (queue.length) { // composite closure
    const g = queue.pop(), d = gSlice(g); if (d.length < 10) continue; const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    if (dv.getInt16(0) >= 0) continue;
    const list = []; let p = 10, fl;
    do { fl = dv.getUint16(p); const gi = dv.getUint16(p + 2); list.push([p + 2, gi]); if (!keep.has(gi) && gi < nGlyphs) { keep.add(gi); queue.push(gi); } p += 4 + (fl & 1 ? 4 : 2) + (fl & 8 ? 2 : fl & 0x40 ? 4 : fl & 0x80 ? 8 : 0); } while (fl & 0x20);
    comps.set(g, list);
  }
  const order = [...keep].sort((a, b) => a - b), remap = new Map(order.map((g, i) => [g, i]));
  const newGlyf = [], newLoca = [0]; let pos = 0;
  for (const g of order) {
    const d = gSlice(g).slice(); if (comps.has(g)) { const dv = new DataView(d.buffer); for (const [o, gi] of comps.get(g)) dv.setUint16(o, remap.get(gi) ?? 0); }
    const padded = new Uint8Array(Math.ceil(d.length / 4) * 4); padded.set(d); newGlyf.push(padded); pos += padded.length; newLoca.push(pos);
  }
  const glyfOut = new Uint8Array(pos); { let o = 0; for (const d of newGlyf) { glyfOut.set(d, o); o += d.length; } }
  const locaOut = new DataView(new ArrayBuffer(newLoca.length * 4)); newLoca.forEach((v, i) => locaOut.setUint32(i * 4, v));
  const hm = new DataView(T.hmtx.buffer, T.hmtx.byteOffset, T.hmtx.byteLength), N = order.length, hmOut = new DataView(new ArrayBuffer(N * 4));
  order.forEach((g, i) => { const adv = hm.getUint16(Math.min(g, nHM - 1) * 4), lsb = g < nHM ? hm.getInt16(g * 4 + 2) : hm.getInt16(nHM * 4 + (g - nHM) * 2); hmOut.setUint16(i * 4, adv); hmOut.setInt16(i * 4 + 2, lsb); });
  const out = {}; for (const t of ['cvt ', 'fpgm', 'prep', 'gasp', 'OS/2', 'name', 'head', 'hhea', 'maxp']) if (T[t]) out[t] = T[t].slice();
  out.glyf = glyfOut; out.loca = new Uint8Array(locaOut.buffer); out.hmtx = new Uint8Array(hmOut.buffer);
  out.cmap = buildCmap(chosen.map(([c, g]) => [c, remap.get(g)]));
  new DataView(out.maxp.buffer).setUint16(4, N); new DataView(out.hhea.buffer).setUint16(34, N);
  new DataView(out.head.buffer).setInt16(50, 1); new DataView(out.head.buffer).setUint32(8, 0);
  if (T.post && T.post.length >= 32) { out.post = T.post.slice(0, 32); new DataView(out.post.buffer).setUint32(0, 0x00030000); }
  const tags = Object.keys(out).sort(), nT = tags.length, sr = 16 * 2 ** Math.floor(Math.log2(nT));
  let off = 12 + nT * 16; const placed = tags.map((t) => { const o = off; off += Math.ceil(out[t].length / 4) * 4; return o; });
  const sfnt = new Uint8Array(off), sdv = new DataView(sfnt.buffer); sdv.setUint32(0, 0x00010000); sdv.setUint16(4, nT); sdv.setUint16(6, sr); sdv.setUint16(8, Math.floor(Math.log2(nT))); sdv.setUint16(10, nT * 16 - sr);
  tags.forEach((t, i) => { const e = 12 + i * 16; for (let k = 0; k < 4; k++) sfnt[e + k] = t.charCodeAt(k); sdv.setUint32(e + 4, sfntSum(out[t])); sdv.setUint32(e + 8, placed[i]); sdv.setUint32(e + 12, out[t].length); sfnt.set(out[t], placed[i]); });
  const adj = (0xb1b0afba - sfntSum(sfnt)) >>> 0, hi = tags.indexOf('head'); sdv.setUint32(placed[hi] + 8, adj);
  { // head checksum in the directory was computed with adjustment 0, as the spec requires
  }
  let file = sfnt, mime = 'font/ttf', ext = 'ttf';
  if (outFormat === 'WOFF') {
    const comp = []; for (const t of tags) { const raw = t === 'head' ? sfnt.slice(placed[hi], placed[hi] + out.head.length) : out[t]; const z = typeof CompressionStream !== 'undefined' ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()) : raw; comp.push(z.length < raw.length ? z : raw); }
    let o = 44 + nT * 20; const offs = comp.map((c) => { const x = o; o += Math.ceil(c.length / 4) * 4; return x; });
    const w = new Uint8Array(o), wd = new DataView(w.buffer); wd.setUint32(0, 0x774f4646); wd.setUint32(4, 0x00010000); wd.setUint32(8, o); wd.setUint16(12, nT); wd.setUint32(16, sfnt.length);
    tags.forEach((t, i) => { const e = 44 + i * 20; for (let k = 0; k < 4; k++) w[e + k] = t.charCodeAt(k); wd.setUint32(e + 4, offs[i]); wd.setUint32(e + 8, comp[i].length); wd.setUint32(e + 12, t === 'head' ? out.head.length : out[t].length); wd.setUint32(e + 16, sdv.getUint32(12 + i * 16 + 4)); w.set(comp[i], offs[i]); });
    file = w; mime = 'font/woff'; ext = 'woff';
  }
  return { file, mime, ext, glyphs: N, originalGlyphs: nGlyphs, kept: chosen, missing, dropped: Object.keys(T).filter((t) => !out[t]), originalSize: u8.length, hasLayout: !!(T.GSUB || T.GPOS || T.kern) };
}
D.push({
  id: 'font-subsetter', cat: 'Dev Extras', title: 'TrueType Font Subsetter (TTF / WOFF)', inputs: 1, labels: ['Characters to keep'], sample: 'Hello, world! Café',
  desc: 'Cut a TrueType font down to the characters you use: keeps those glyphs (and composite parts), rebuilds cmap, glyf, loca and metrics, and saves a much smaller TTF or WOFF. Hand-written, checked against fontTools. Drops kerning and ligatures. Check the font licence first.',
  file: { accept: '.ttf,.woff,font/ttf,font/woff' },
  opts: [{ id: 'ascii', label: 'Also keep printable ASCII (U+0020-007E)', type: 'checkbox', def: false }, { id: 'ranges', label: 'Extra code points (e.g. U+00C0-00FF, U+20AC)', type: 'text', def: '' }, { id: 'format', label: 'Output format', type: 'select', choices: ['TTF', 'WOFF'], def: 'TTF' }],
  run: async ([txt], o, files) => {
    if (!files?.[0]) throw new Error('Choose a .ttf (TrueType) or .woff font file.');
    const cps = fontCodepoints(txt, o.ranges, o.ascii); if (!cps.size) throw new Error('Type the characters to keep, or tick the ASCII box.');
    const r = await ttfSubset(await u8of(files[0]), cps, { outFormat: o.format });
    const pct = Math.round(100 * (1 - r.file.length / r.originalSize));
    return { text: [`Subset font: ${r.glyphs} glyphs (from ${r.originalGlyphs}), ${r.file.length} bytes (${r.originalSize} bytes before, ${pct}% smaller). Format: ${r.ext.toUpperCase()}.`, `Characters kept: ${r.kept.length}${r.missing.length ? '; not in the font: ' + r.missing.map((c) => 'U+' + c.toString(16).toUpperCase().padStart(4, '0')).join(' ') : ''}`, `Dropped tables: ${r.dropped.join(', ') || 'none'}${r.hasLayout ? ' (kerning / ligatures / OpenType features are gone)' : ''}`, 'Check that the font licence allows subsetting and embedding before you publish the result.'].join('\n'), blob: [new Blob([r.file], { type: r.mime })], filename: 'subset.' + r.ext };
  },
});

// =====================================================================================================
// PSD viewer / flattener: Photoshop (PSD, not PSB) layer list with names, bounds, blend mode, opacity, visibility, groups and kinds, the stored
// composite image, a flatten of the pixel layers, and export of one layer as PNG. RGB and grayscale, 8 and 16 bit, raw / RLE / ZIP / ZIP+prediction.
// Flattening honours opacity, hidden layers and hidden groups, layer masks, clipping, and the blend modes normal, multiply, screen, overlay, darken,
// lighten, difference, linear dodge, exclusion. Verified against psd-tools (layer pixels and bounds exact; flatten within rounding of its compositor).
// Skipped: CMYK / Lab / indexed / bitmap / 32-bit modes, PSB, layer effects (drop shadow, strokes), adjustment layers, smart-object / text / vector
// rendering (listed, not drawn), vector masks, other blend modes (treated as normal and reported), the soft-light/colour families, pass-through
// nuances, and any file whose stored composite was saved without "maximise compatibility".
// =====================================================================================================
const PSD_BLEND = { 'norm': 'Normal', 'diss': 'Dissolve', 'dark': 'Darken', 'mul ': 'Multiply', 'idiv': 'Color burn', 'lbrn': 'Linear burn', 'dkCl': 'Darker color', 'lite': 'Lighten', 'scrn': 'Screen', 'div ': 'Color dodge', 'lddg': 'Linear dodge (add)', 'lgCl': 'Lighter color', 'over': 'Overlay', 'sLit': 'Soft light', 'hLit': 'Hard light', 'vLit': 'Vivid light', 'lLit': 'Linear light', 'pLit': 'Pin light', 'hMix': 'Hard mix', 'diff': 'Difference', 'smud': 'Exclusion', 'fsub': 'Subtract', 'fdiv': 'Divide', 'hue ': 'Hue', 'sat ': 'Saturation', 'colr': 'Color', 'lum ': 'Luminosity', 'pass': 'Pass through' };
const PSD_KINDS = { TySh: 'text', tySh: 'text', SoLd: 'smart object', PlLd: 'placed layer', SoCo: 'solid colour fill', GdFl: 'gradient fill', PtFl: 'pattern fill', vmsk: 'shape (vector mask)', vsms: 'shape (vector mask)', brit: 'adjustment', levl: 'adjustment', curv: 'adjustment', hue2: 'adjustment', blnc: 'adjustment', blwh: 'adjustment', phfl: 'adjustment', mixr: 'adjustment', clrL: 'adjustment', nvrt: 'adjustment', post: 'adjustment', thrs: 'adjustment', selc: 'adjustment', vibA: 'adjustment', grdm: 'adjustment', expA: 'adjustment' };
export function psdParse(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let p = 0;
  const need = (n) => { if (p + n > u8.length) throw new Error('PSD file is truncated.'); };
  const tag = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  need(26); if (tag(0) !== '8BPS') throw new Error('Not a Photoshop file (signature 8BPS not found).');
  const version = dv.getUint16(4); if (version === 2) throw new Error('Large Document Format (PSB) files are not supported; PSD (version 1) is.'); if (version !== 1) throw new Error('Unknown PSD version ' + version);
  const hd = { channels: dv.getUint16(12), height: dv.getUint32(14), width: dv.getUint32(18), depth: dv.getUint16(22), mode: dv.getUint16(24) };
  const modeName = { 0: 'Bitmap', 1: 'Grayscale', 2: 'Indexed', 3: 'RGB', 4: 'CMYK', 7: 'Multichannel', 8: 'Duotone', 9: 'Lab' }[hd.mode] || hd.mode;
  p = 26; const skip = () => { need(4); const n = dv.getUint32(p); p += 4; need(n); const s = p; p += n; return [s, n]; };
  skip(); skip(); // colour mode data, image resources
  const [lmStart, lmLen] = skip(), layers = []; let warnings = [];
  if (lmLen > 0) {
    let q = lmStart; const liLen = dv.getUint32(q); q += 4; const liEnd = q + liLen;
    if (liLen > 0) {
      let count = dv.getInt16(q); q += 2; const firstAlpha = count < 0; count = Math.abs(count);
      for (let i = 0; i < count; i++) {
        const L = { index: i, top: dv.getInt32(q), left: dv.getInt32(q + 4), bottom: dv.getInt32(q + 8), right: dv.getInt32(q + 12), channels: [] }; q += 16;
        const nch = dv.getUint16(q); q += 2; for (let k = 0; k < nch; k++) { L.channels.push({ id: dv.getInt16(q), len: dv.getUint32(q + 2) }); q += 6; }
        if (tag(q) !== '8BIM') throw new Error('Layer record ' + (i + 1) + ' is damaged (blend signature missing).');
        L.blend = tag(q + 4); L.opacity = u8[q + 8]; L.clip = u8[q + 9]; L.flags = u8[q + 10]; L.visible = !(L.flags & 2); q += 12;
        const extraLen = dv.getUint32(q); q += 4; const extraEnd = q + extraLen, ml = dv.getUint32(q); q += 4;
        if (ml >= 18) L.mask = { top: dv.getInt32(q), left: dv.getInt32(q + 4), bottom: dv.getInt32(q + 8), right: dv.getInt32(q + 12), def: u8[q + 16], flags: u8[q + 17] };
        q += ml; q += 4 + dv.getUint32(q); // blending ranges
        const nl = u8[q]; L.name = new TextDecoder('macintosh').decode(u8.subarray(q + 1, q + 1 + nl)); q += 1 + nl; q += (4 - ((1 + nl) % 4)) % 4;
        L.kind = 'pixel'; L.group = 0;
        while (q + 12 <= extraEnd && (tag(q) === '8BIM' || tag(q) === '8B64')) {
          const key = tag(q + 4), len = dv.getUint32(q + 8), d = q + 12;
          if (key === 'luni' && len >= 4) { const n = dv.getUint32(d); let s = ''; for (let k = 0; k < n && d + 4 + k * 2 + 2 <= u8.length; k++) s += String.fromCharCode(dv.getUint16(d + 4 + k * 2)); if (s) L.name = s; }
          else if (key === 'lsct' || key === 'lsdk') { L.group = dv.getUint32(d); if (L.group === 1 || L.group === 2) L.kind = 'group'; else if (L.group === 3) L.kind = 'group end marker'; }
          else if (PSD_KINDS[key] && L.kind === 'pixel') L.kind = PSD_KINDS[key];
          q = d + len; for (const pad of [0, 1, 2, 3]) { if (tag(q + pad) === '8BIM' || tag(q + pad) === '8B64') { q += pad; break; } if (pad === 3) q = Math.min(q, extraEnd); }
        }
        q = extraEnd; layers.push(L);
      }
      for (const L of layers) for (const c of L.channels) { c.off = q; q += c.len; if (q > u8.length) throw new Error('Layer pixel data runs past the end of the file.'); }
      void firstAlpha;
    }
  }
  p = lmStart + lmLen;
  const merged = p + 2 <= u8.length ? { comp: dv.getUint16(p), off: p + 2 } : null;
  return { u8, dv, hd, modeName, layers, merged, warnings, maxLayersNote: null };
}
async function psdPlane(psd, off, len, w, h, comp, bytes) { // decode one channel plane to raw bytes (w*h*bytes)
  const u8 = psd.u8, dv = psd.dv, size = w * h * bytes;
  if (!size) return new Uint8Array(0);
  if (comp === 0) { if (off + size > u8.length) throw new Error('Raw channel data truncated.'); return u8.subarray(off, off + size); }
  if (comp === 1) { const out = new Uint8Array(size); let pos = off + h * 2; for (let y = 0; y < h; y++) { const n = dv.getUint16(off + y * 2); out.set(packBits(u8.subarray(pos, pos + n), w * bytes), y * w * bytes); pos += n; } return out; }
  if (comp === 2 || comp === 3) {
    const raw = await inflate(u8.subarray(off, off + len)); if (raw.length < size) throw new Error('ZIP channel data is too short.');
    const out = raw.slice(0, size);
    if (comp === 3) { if (bytes === 1) for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) out[y * w + x] = (out[y * w + x] + out[y * w + x - 1]) & 255; else { const odv = new DataView(out.buffer); for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) odv.setUint16((y * w + x) * 2, (odv.getUint16((y * w + x) * 2) + odv.getUint16((y * w + x - 1) * 2)) & 0xffff); } }
    return out;
  }
  throw new Error('Unknown channel compression ' + comp);
}
const to8 = (plane, bytes) => { if (bytes === 1) return plane; const o = new Uint8Array(plane.length >> 1); for (let i = 0; i < o.length; i++) o[i] = plane[i * 2]; return o; };
export async function psdLayerPixels(psd, L) {
  const w = L.right - L.left, h = L.bottom - L.top, bytes = psd.hd.depth >> 3, rgba = new Uint8ClampedArray(Math.max(0, w * h) * 4);
  if (w <= 0 || h <= 0) return { w: 0, h: 0, rgba };
  const planes = {}; let mask = null;
  for (const c of L.channels) {
    const comp = psd.dv.getUint16(c.off); let cw = w, ch = h; if (c.id < -1) { if (!L.mask) continue; cw = L.mask.right - L.mask.left; ch = L.mask.bottom - L.mask.top; }
    const pl = to8(await psdPlane(psd, c.off + 2, c.len - 2, cw, ch, comp, bytes), bytes); if (c.id === -2) mask = { pl, w: cw, h: ch }; else if (c.id >= -1) planes[c.id] = pl;
  }
  const gray = psd.hd.mode === 1, R = planes[0], G = gray ? planes[0] : planes[1], B = gray ? planes[0] : planes[2], A = planes[-1];
  if (!R || !G || !B) throw new Error('Layer "' + L.name + '" lacks colour channels.');
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = R[i]; rgba[i * 4 + 1] = G[i]; rgba[i * 4 + 2] = B[i]; rgba[i * 4 + 3] = A ? A[i] : 255; }
  return { w, h, rgba, mask };
}
const BLENDFN = {
  'mul ': (b, s) => b * s, 'scrn': (b, s) => b + s - b * s, 'over': (b, s) => (b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)), 'dark': Math.min, 'lite': Math.max,
  'diff': (b, s) => Math.abs(b - s), 'lddg': (b, s) => Math.min(1, b + s), 'smud': (b, s) => b + s - 2 * b * s,
};
export async function psdFlatten(psd, { background = null } = {}) {
  const { width: W, height: H } = psd.hd; if (W * H > 60e6) throw new Error('Canvas too large for the browser flattener.');
  const out = new Float32Array(W * H * 4), unsupported = new Set(); // premultiplied-free: r,g,b in 0..1, a in 0..1 (straight)
  const hidden = new Array(psd.layers.length).fill(false); const stack = [];
  for (let i = psd.layers.length - 1; i >= 0; i--) { const L = psd.layers[i]; if (L.group === 3) { stack.pop(); } if (stack.some(Boolean)) hidden[i] = true; if (L.group === 1 || L.group === 2) stack.push(!L.visible || stack.some(Boolean)); }
  let baseAlpha = null;
  for (let i = 0; i < psd.layers.length; i++) {
    const L = psd.layers[i]; if (L.kind === 'group' || L.kind === 'group end marker') continue;
    if (!L.visible || hidden[i]) { continue; }
    if (L.kind !== 'pixel') { if (L.channels.some((c) => c.id >= 0 && c.len > 2)) { /* raster data exists: draw it */ } else { unsupported.add(`${L.name} (${L.kind})`); continue; } }
    const px = await psdLayerPixels(psd, L); if (!px.w) continue;
    const fn = BLENDFN[L.blend]; if (!fn && L.blend !== 'norm' && L.blend !== 'pass') unsupported.add(`${L.name} (${PSD_BLEND[L.blend] || L.blend} blend, drawn as normal)`);
    const own = L.clip ? null : new Float32Array(W * H);
    for (let y = 0; y < px.h; y++) {
      const Y = y + L.top; if (Y < 0 || Y >= H) continue;
      for (let x = 0; x < px.w; x++) {
        const X = x + L.left; if (X < 0 || X >= W) continue;
        const s = (y * px.w + x) * 4, d = (Y * W + X) * 4; let a = px.rgba[s + 3] / 255;
        if (L.mask && !(L.mask.flags & 2) && px.mask) { const mx = X - L.mask.left, my = Y - L.mask.top; a *= (mx >= 0 && my >= 0 && mx < px.mask.w && my < px.mask.h ? px.mask.pl[my * px.mask.w + mx] : L.mask.def) / 255; }
        if (own) own[Y * W + X] = a;
        a *= L.opacity / 255; if (L.clip && baseAlpha) a *= baseAlpha[Y * W + X]; if (a <= 0) continue;
        const ab = out[d + 3], ao = a + ab * (1 - a);
        for (let k = 0; k < 3; k++) { const cs = px.rgba[s + k] / 255, cb = out[d + k], cm = fn ? (1 - ab) * cs + ab * fn(cb, cs) : cs; out[d + k] = (a * cm + (1 - a) * ab * cb) / ao; }
        out[d + 3] = ao;
      }
    }
    if (own) baseAlpha = own;
  }
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { const a = out[i * 4 + 3], bg = background; for (let k = 0; k < 3; k++) rgba[i * 4 + k] = Math.round((bg ? out[i * 4 + k] * a + bg[k] / 255 * (1 - a) : out[i * 4 + k]) * 255); rgba[i * 4 + 3] = bg ? 255 : Math.round(a * 255); }
  return { w: W, h: H, rgba, unsupported: [...unsupported] };
}
export async function psdStoredComposite(psd) {
  const { width: W, height: H, channels, depth, mode } = psd.hd, bytes = depth >> 3, m = psd.merged; if (!m) throw new Error('This file has no stored composite image.');
  if (mode !== 3 && mode !== 1) throw new Error(`Colour mode ${psd.modeName} is not supported (RGB and grayscale are).`); if (depth !== 8 && depth !== 16) throw new Error(`${depth}-bit colour is not supported (8 and 16 bit are).`);
  const planes = []; const u8 = psd.u8, dv = psd.dv, n = Math.min(channels, mode === 3 ? 4 : 2);
  if (m.comp === 0) for (let c = 0; c < n; c++) planes.push(to8(await psdPlane(psd, m.off + c * W * H * bytes, 0, W, H, 0, bytes), bytes));
  else if (m.comp === 1) { let pos = m.off + channels * H * 2; for (let c = 0; c < channels; c++) { const out = new Uint8Array(W * H * bytes); for (let y = 0; y < H; y++) { const len = dv.getUint16(m.off + (c * H + y) * 2); out.set(packBits(u8.subarray(pos, pos + len), W * bytes), y * W * bytes); pos += len; } if (c < n) planes.push(to8(out, bytes)); } }
  else throw new Error('Stored composite uses compression ' + m.comp + ', which is not supported.');
  const rgba = new Uint8ClampedArray(W * H * 4), gray = mode === 1, hasA = planes.length > (gray ? 1 : 3);
  for (let i = 0; i < W * H; i++) { rgba[i * 4] = planes[0][i]; rgba[i * 4 + 1] = gray ? planes[0][i] : planes[1][i]; rgba[i * 4 + 2] = gray ? planes[0][i] : planes[2][i]; rgba[i * 4 + 3] = hasA ? planes[gray ? 1 : 3][i] : 255; }
  return { w: W, h: H, rgba };
}
export function psdReport(psd) {
  const { hd } = psd, L = [`Photoshop document ${hd.width} x ${hd.height} px, ${psd.modeName}, ${hd.depth} bits per channel, ${hd.channels} channels, ${psd.layers.length} layer records`];
  const rows = psd.layers.map((l, i) => [i + 1, l.name, l.kind, `${l.right - l.left}x${l.bottom - l.top} @ ${l.left},${l.top}`, PSD_BLEND[l.blend] || l.blend, Math.round(l.opacity / 2.55) + '%', l.visible ? 'yes' : 'no', l.clip ? 'clipped' : '', l.mask ? 'mask' : '']);
  if (rows.length) { L.push('', 'Layers, numbered bottom to top (as stored; "group end marker" closes a group, the group itself comes after its members):', table(['#', 'Name', 'Kind', 'Size @ left,top', 'Blend', 'Opacity', 'Visible', 'Clip', 'Mask'], rows)); }
  return L.join('\n');
}
D.push({
  id: 'psd-layer-viewer', cat: IMGC, title: 'PSD Viewer: Layers, Composite and Flatten (Photoshop File)', inputs: 0, dom: true,
  desc: 'Open a Photoshop .psd in your browser: list layers (names, bounds, blend modes, opacity, groups), see the stored composite, flatten the pixel layers with opacity, masks and common blend modes, or export a single layer as PNG. RGB and grayscale, 8 and 16 bit.',
  file: { accept: '.psd,image/vnd.adobe.photoshop' },
  opts: [{ id: 'output', label: 'Image output', type: 'select', choices: ['Composite stored in the file', 'Flatten layers (this tool)', 'One layer (number below)', 'None'], def: 'Composite stored in the file' }, { id: 'layer', label: 'Layer number (for one-layer export)', type: 'number', def: 1 }],
  run: async (_i, o, files) => {
    if (!files?.[0]) throw new Error('Choose a .psd file.');
    const psd = psdParse(await u8of(files[0])); let text = psdReport(psd), img = null, name = 'psd.png';
    if (psd.hd.mode !== 3 && psd.hd.mode !== 1) text += `\n\nColour mode ${psd.modeName} is not supported for pixels (RGB and grayscale are); only the layer list is shown.`;
    else if (o.output !== 'None') {
      try {
        if (o.output.startsWith('Composite')) { img = await psdStoredComposite(psd); name = 'psd-composite.png'; }
        else if (o.output.startsWith('Flatten')) { img = await psdFlatten(psd); name = 'psd-flattened.png'; if (img.unsupported.length) text += '\n\nNot drawn or approximated: ' + img.unsupported.join('; '); }
        else { const n = Math.floor(+o.layer || 1), l = psd.layers[n - 1]; if (!l) throw new Error(`No layer ${n}; the file has ${psd.layers.length} layer records.`); img = await psdLayerPixels(psd, l); if (!img.w) throw new Error('That layer has no pixels (group or empty).'); name = `layer-${n}.png`; }
      } catch (e) { text += '\n\nImage not produced: ' + e.message; }
    }
    if (!img) return text;
    const blob = await rgbaToPng(img.rgba, img.w, img.h); return { text: text + `\n\nImage: ${img.w} x ${img.h} px.`, blob: [blob], filename: name };
  },
});

// =====================================================================================================
// Image to SVG tracer: colour quantisation (median cut + k-means refinement), speckle removal, exact pixel-edge boundary tracing with holes,
// Douglas-Peucker simplification and optional curve smoothing (quadratic Beziers through edge midpoints, sharp corners kept). Layers are stacked
// (each colour also covers the colours drawn above it) so no hairline gaps appear between neighbouring shapes.
// Verified by rendering the SVG with cairosvg and comparing with the quantised image (mismatch only along anti-aliased edges).
// Skipped: gradients and photographs (they turn into flat colour bands, which is what posterising means), strokes / centre-line tracing,
// anti-aliased edge fitting like potrace's optimal curves, text recognition. Large images are traced at most 1000 px on the long side.
// =====================================================================================================
export function quantize(rgba, w, h, k, { denoise = 0 } = {}) {
  const n = w * h, label = new Int16Array(n).fill(-1), hist = new Map();
  const flat = (i) => { const x = i % w; for (const j of [x < w - 1 ? i + 1 : -1, i + w < n ? i + w : -1]) if (j >= 0) for (let c = 0; c < 3; c++) if (Math.abs(rgba[i * 4 + c] - rgba[j * 4 + c]) > 20) return false; return true; };
  for (let pass = 0; pass < 2 && !hist.size; pass++) for (let i = 0; i < n; i++) { if (rgba[i * 4 + 3] < 128 || (pass === 0 && !flat(i))) continue; const key = ((rgba[i * 4] >> 3) << 10) | ((rgba[i * 4 + 1] >> 3) << 5) | (rgba[i * 4 + 2] >> 3); hist.set(key, (hist.get(key) || 0) + 1); } // palette from flat areas only: anti-aliased edge blends should not take palette slots
  const bins = [...hist].map(([key, c]) => ({ r: ((key >> 10) & 31) * 8 + 4, g: ((key >> 5) & 31) * 8 + 4, b: (key & 31) * 8 + 4, c, key }));
  if (!bins.length) throw new Error('The image is fully transparent.');
  let boxes = [bins];
  const range = (bx) => { let lo = [255, 255, 255], hi = [0, 0, 0]; for (const p of bx) { const v = [p.r, p.g, p.b]; for (let a = 0; a < 3; a++) { if (v[a] < lo[a]) lo[a] = v[a]; if (v[a] > hi[a]) hi[a] = v[a]; } } return hi.map((x, a) => x - lo[a]); };
  while (boxes.length < k) {
    let best = -1, bs = 0, ba = 0; boxes.forEach((bx, i) => { if (bx.length < 2) return; const r = range(bx), a = r.indexOf(Math.max(...r)), s = r[a] * Math.sqrt(bx.reduce((t, p) => t + p.c, 0)); if (s > bs) { bs = s; best = i; ba = a; } });
    if (best < 0 || bs === 0) break;
    const bx = boxes[best], key = ['r', 'g', 'b'][ba]; bx.sort((p, q) => p[key] - q[key]); const tot = bx.reduce((t, p) => t + p.c, 0); let acc = 0, cut = 1;
    for (let i = 0; i < bx.length - 1; i++) { acc += bx[i].c; cut = i + 1; if (acc >= tot / 2) break; }
    boxes.splice(best, 1, bx.slice(0, cut), bx.slice(cut));
  }
  let pal = boxes.map((bx) => { const t = bx.reduce((s, p) => s + p.c, 0); return [bx.reduce((s, p) => s + p.r * p.c, 0) / t, bx.reduce((s, p) => s + p.g * p.c, 0) / t, bx.reduce((s, p) => s + p.b * p.c, 0) / t]; });
  const nearest = (r, g, b) => { let bi = 0, bd = Infinity; for (let i = 0; i < pal.length; i++) { const d = (pal[i][0] - r) ** 2 + (pal[i][1] - g) ** 2 + (pal[i][2] - b) ** 2; if (d < bd) { bd = d; bi = i; } } return bi; };
  for (let it = 0; it < 4; it++) { const acc = pal.map(() => [0, 0, 0, 0]); for (const p of bins) { const i = nearest(p.r, p.g, p.b); acc[i][0] += p.r * p.c; acc[i][1] += p.g * p.c; acc[i][2] += p.b * p.c; acc[i][3] += p.c; } pal = pal.map((c, i) => (acc[i][3] ? [acc[i][0] / acc[i][3], acc[i][1] / acc[i][3], acc[i][2] / acc[i][3]] : c)); }
  const cache = new Map();
  for (let i = 0; i < n; i++) { if (rgba[i * 4 + 3] < 128) continue; const key = ((rgba[i * 4] >> 3) << 10) | ((rgba[i * 4 + 1] >> 3) << 5) | (rgba[i * 4 + 2] >> 3); let l = cache.get(key); if (l === undefined) { l = nearest(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]); cache.set(key, l); } label[i] = l; }
  for (let pass = 0; pass < denoise; pass++) { // 3x3 majority filter
    const src = label.slice(); const cnt = new Int32Array(pal.length);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (src[i] < 0) continue; cnt.fill(0); let bestL = src[i], bc = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const l = src[i + dy * w + dx]; if (l >= 0 && ++cnt[l] > bc) { bc = cnt[l]; bestL = l; } } if (bc >= 5) label[i] = bestL; }
  }
  return { label, pal: pal.map((c) => c.map((x) => Math.round(x))) };
}
function removeSpeckles(label, w, h, minArea) {
  if (minArea <= 1) return;
  const seen = new Uint8Array(w * h), stack = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || label[s] < 0) continue; const l = label[s], comp = []; stack.push(s); seen[s] = 1; const nb = new Map();
    while (stack.length) { const i = stack.pop(); comp.push(i); const x = i % w, y = (i - x) / w; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) { if (j < 0) continue; if (label[j] === l) { if (!seen[j]) { seen[j] = 1; stack.push(j); } } else if (label[j] >= 0) nb.set(label[j], (nb.get(label[j]) || 0) + 1); } }
    if (comp.length < minArea && nb.size) { const to = [...nb].sort((a, b) => b[1] - a[1])[0][0]; for (const i of comp) label[i] = to; }
  }
}
function traceLoops(mask, w, h) { // boundary loops of a binary mask, as arrays of [x, y] corner vertices (filled region on the right of travel)
  const W1 = w + 1, out = new Uint8Array(W1 * (h + 1)), on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    if (!on(x, y - 1)) out[y * W1 + x] |= 1;          // top edge, going right
    if (!on(x + 1, y)) out[y * W1 + x + 1] |= 2;      // right edge, going down
    if (!on(x, y + 1)) out[(y + 1) * W1 + x + 1] |= 4; // bottom edge, going left
    if (!on(x - 1, y)) out[(y + 1) * W1 + x] |= 8;     // left edge, going up
  }
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1], loops = [];
  for (let v = 0; v < out.length; v++) {
    while (out[v]) {
      let d = out[v] & 1 ? 0 : out[v] & 2 ? 1 : out[v] & 4 ? 2 : 3, x = v % W1, y = (v - x) / W1; const pts = []; const sx = x, sy = y, sd = d;
      for (;;) {
        out[y * W1 + x] &= ~(1 << d); pts.push([x, y, d]); x += DX[d]; y += DY[d];
        const m = out[y * W1 + x]; let nd = -1; for (const t of [(d + 1) & 3, d, (d + 3) & 3]) if (m & (1 << t)) { nd = t; break; }
        if (nd < 0) break; d = nd; if (x === sx && y === sy && d === sd) break;
      }
      const corners = pts.filter((p, i) => p[2] !== pts[(i + pts.length - 1) % pts.length][2]).map((p) => [p[0], p[1]]);
      if (pts.length >= 4) loops.push({ all: pts.map((p) => [p[0], p[1]]), corners: corners.length >= 3 ? corners : pts.map((p) => [p[0], p[1]]) });
    }
  }
  return loops;
}
// Smooth a pixel-staircase loop: detect real corners (turn sharper than ~125 degrees over a 5-sample window), relax the other samples with a
// [1 2 1] filter keeping corners fixed, then Douglas-Peucker between the kept anchors. Returns [x, y, isCorner] points.
function smoothLoop(all, tol) {
  const n = all.length, K = 5; if (n < 16) return all.map((p) => [p[0], p[1], 1]);
  const corner = new Uint8Array(n), ang = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = all[(i + n - K) % n], p = all[i], b = all[(i + K) % n], ux = a[0] - p[0], uy = a[1] - p[1], vx = b[0] - p[0], vy = b[1] - p[1]; ang[i] = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1); }
  for (let i = 0; i < n; i++) { if (ang[i] > -0.57) { let best = true; for (let d = -K; d <= K; d++) if (ang[(i + d + n) % n] > ang[i] + 1e-9) best = false; if (best) corner[i] = 1; } } // cos > -0.57: angle under ~125 degrees, local sharpest only
  let P = all.map((p) => [p[0], p[1]]);
  for (let it = 0; it < 4; it++) { const Q = P.map((p) => p.slice()); for (let i = 0; i < n; i++) { if (corner[i]) continue; const a = P[(i + n - 1) % n], b = P[(i + 1) % n]; Q[i] = [(a[0] + 2 * P[i][0] + b[0]) / 4, (a[1] + 2 * P[i][1] + b[1]) / 4]; } P = Q; }
  const keep = new Uint8Array(n); const anchors = []; for (let i = 0; i < n; i++) if (corner[i]) { keep[i] = 1; anchors.push(i); }
  if (anchors.length < 2) { let far = 0, fd = -1; for (let i = 1; i < n; i++) { const d = (P[i][0] - P[0][0]) ** 2 + (P[i][1] - P[0][1]) ** 2; if (d > fd) { fd = d; far = i; } } keep[0] = 1; keep[far] = 1; anchors.length = 0; anchors.push(0, far); }
  const dp = (a, b) => { let md = 0, mi = -1; const A = P[a % n], B = P[b % n], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1; for (let i = a + 1; i < b; i++) { const q = P[i % n], d = Math.abs(dy * (q[0] - A[0]) - dx * (q[1] - A[1])) / L; if (d > md) { md = d; mi = i; } } if (md > tol && mi >= 0) { keep[mi % n] = 1; dp(a, mi); dp(mi, b); } };
  for (let k = 0; k < anchors.length; k++) { const a = anchors[k]; let b = anchors[(k + 1) % anchors.length]; if (b <= a) b += n; dp(a, b); }
  const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push([P[i][0], P[i][1], corner[i]]); return out;
}
const fx = (v, s) => String(Math.round(v * s * 10) / 10);
function loopPath(pts, smooth, s) { // pts: [x, y, isCorner]
  const n = pts.length; if (n < 3) return '';
  if (!smooth) return 'M' + pts.map((p) => fx(p[0], s) + ' ' + fx(p[1], s)).join('L') + 'Z';
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]); let d = `M${fx(m0[0], s)} ${fx(m0[1], s)}`;
  for (let i = 0; i < n; i++) { const p = pts[i], m = mid(p, pts[(i + 1) % n]); d += p[2] ? `L${fx(p[0], s)} ${fx(p[1], s)}L${fx(m[0], s)} ${fx(m[1], s)}` : `Q${fx(p[0], s)} ${fx(p[1], s)} ${fx(m[0], s)} ${fx(m[1], s)}`; }
  return d + 'Z';
}
export function traceToSvg(rgba, w, h, { colors = 8, tolerance = 1, minArea = 8, smooth = true, denoise = 1, mode = 'colour', threshold = 0, outW = w, outH = h } = {}) {
  let label, pal;
  if (mode === 'bw') {
    const lum = new Float32Array(w * h), histo = new Float64Array(256); for (let i = 0; i < w * h; i++) { const l = rgba[i * 4 + 3] < 128 ? 255 : 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]; lum[i] = l; histo[Math.round(l)]++; }
    let t = threshold; if (!t) { let sum = 0; for (let i = 0; i < 256; i++) sum += i * histo[i]; let wb = 0, sb = 0, mx = 0; t = 128; for (let i = 0; i < 256; i++) { wb += histo[i]; if (!wb) continue; const wf = w * h - wb; if (!wf) break; sb += i * histo[i]; const mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) ** 2; if (v > mx) { mx = v; t = i; } } }
    label = new Int16Array(w * h); for (let i = 0; i < w * h; i++) label[i] = lum[i] <= t ? 0 : -1; pal = [[0, 0, 0]];
  } else ({ label, pal } = quantize(rgba, w, h, clamp(colors, 2, 64), { denoise: clamp(denoise, 0, 3) }));
  removeSpeckles(label, w, h, clamp(minArea, 0, 10000));
  const count = new Int32Array(pal.length); for (const l of label) if (l >= 0) count[l]++;
  const order = [...pal.keys()].filter((i) => count[i] > 0).sort((a, b) => (mode === 'bw' ? 0 : count[b] - count[a])), s = outW / w, parts = []; let nPaths = 0, nPoints = 0;
  const hex = (c) => '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
  const rank = new Int16Array(pal.length).fill(-1); order.forEach((l, i) => { rank[l] = i; });
  order.forEach((l, i) => {
    const mask = new Uint8Array(w * h); let full = true;
    for (let k = 0; k < w * h; k++) { const r = label[k] >= 0 ? rank[label[k]] : -1; if (mode === 'bw' ? label[k] === l : r >= i) mask[k] = 1; else full = false; }
    if (full && i === 0) { parts.push(`<rect width="${fx(w, s)}" height="${fx(h, s)}" fill="${hex(pal[l])}"/>`); nPaths++; return; }
    const tol = clamp(tolerance, 0, 10), d = traceLoops(mask, w, h).map((lp) => { const sl = tol > 0 ? smoothLoop(lp.all, tol) : lp.corners.map((c) => [c[0], c[1], 1]); nPoints += sl.length; return loopPath(sl, smooth && tol > 0, s); }).join('');
    if (d) { parts.push(`<path fill="${hex(pal[l])}" fill-rule="evenodd" d="${d}"/>`); nPaths++; }
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${fx(w, s)} ${fx(h, s)}" role="img" aria-label="Traced image">${parts.join('')}</svg>`;
  return { svg, paths: nPaths, points: nPoints, palette: order.map((l) => hex(pal[l])), label, pal };
}
D.push({
  id: 'image-to-svg-tracer', cat: IMGC, title: 'Image to SVG Tracer (Posterise and Vectorise)', inputs: 0, dom: true,
  desc: 'Turn a PNG, JPG or WebP into a layered SVG: reduce to a few colours, remove specks, trace the outlines with holes and smooth them into curves. Good for logos, icons and flat artwork, not for photos. Runs in your browser.',
  file: { accept: 'image/*' },
  opts: [
    { id: 'mode', label: 'Mode', type: 'select', choices: ['Colour layers', 'Black and white (silhouette)'], def: 'Colour layers' },
    { id: 'colors', label: 'Colours (2-64)', type: 'number', def: 8 }, { id: 'tolerance', label: 'Path simplification in pixels (0 = exact pixel edges)', type: 'number', def: 1 },
    { id: 'minArea', label: 'Remove specks smaller than (pixels)', type: 'number', def: 8 }, { id: 'denoise', label: 'Noise filter passes (0-3)', type: 'number', def: 1 },
    { id: 'smooth', label: 'Smooth curves', type: 'checkbox', def: true }, { id: 'threshold', label: 'Black and white threshold (0 = automatic)', type: 'number', def: 0 },
  ],
  run: async (_i, o, files) => {
    if (!files?.[0]) throw new Error('Choose an image file.');
    const bmp = await createImageBitmap(files[0]), scale = Math.min(1, 1000 / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }), g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, w, h); const data = g.getImageData(0, 0, w, h).data;
    const r = traceToSvg(data, w, h, { colors: o.colors, tolerance: o.tolerance, minArea: o.minArea, smooth: o.smooth !== false, denoise: o.denoise, mode: String(o.mode).startsWith('Black') ? 'bw' : 'colour', threshold: o.threshold, outW: bmp.width, outH: bmp.height });
    return { text: `Traced ${w} x ${h} px${scale < 1 ? ' (downscaled from ' + bmp.width + ' x ' + bmp.height + ')' : ''} into ${r.paths} layer(s), ${r.points} path points, ${r.svg.length} bytes of SVG.\nColours: ${r.palette.join(' ')}\nThe SVG is vector artwork of the posterised image; fine gradients and photographic detail are flattened.`, blob: [new Blob([r.svg], { type: 'image/svg+xml' })], filename: 'traced.svg' };
  },
});
