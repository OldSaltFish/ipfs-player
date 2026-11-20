window.PLAYER_CONFIG = {
  // 默认歌单：方大同 · 精选 20 首（已对外分享，勿改）；进击的巨人版用 ?p=CID 指定
  playlistCid: 'QmdySwro8cPetaergokk4XEB6gf6UCAYLpjgCwqC1xxUUj',

  // 歌单广场：固定收录的歌单（显示顺序即排列顺序）
  playlists: [
    { cid: 'QmdySwro8cPetaergokk4XEB6gf6UCAYLpjgCwqC1xxUUj', title: '方大同 · 精选 20 首',
      meta: '20 首 · 2026-11-05', coverCid: 'QmQMybySrJT4YphDHkc3VYJW8Y2vcUeW8TsqvC8yBw3YbD' },
    { cid: 'Qme9KeUp9i7L9kZnWrXgif3wJryRWMcGxyq1TVsPy2vZye', title: '进击的巨人 · 精选 28 首',
      meta: '28 首 · 2026-11-08', coverCid: 'QmaAN1718WGKEDruohkheo7Hh9hvqiXNDb64DM9HhUF46Z' },
    { cid: 'QmdiAHr24wywSfFAeRCR3nuXBeBFCRHn4z4rSV46bcuLW5', title: '许嵩 · 精选 20 首',
      meta: '20 首 · 2026-11-07', coverCid: 'QmVgmrqVhRKE96JYtthsS3cn4ZKxtV3Jai95BGGKgPzBdK' },
  ],

  // 公共网关，按实测可用性排序；运行时会自动把成功的一个提到最前
  gateways: [
    'https://apac.orbitor.dev/ipfs/',
    'https://ipfs.orbitor.dev/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://eu.orbitor.dev/ipfs/',
    'https://latam.orbitor.dev/ipfs/',
    'https://ipfs.io/ipfs/',
    'https://dweb.link/ipfs/',
  ],
};
