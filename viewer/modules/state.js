// 複数モジュールをまたいで参照される共有ステートのみここに置く。
// 各モジュール固有のステート（searchPages など）はそのモジュール内にローカル変数として持つ。
export const state = {
  pdfDoc: null,
  pageEntries: [], // { pageNum, wrapper, canvas, rendered, textLayer, textItems }
  currentSearchTerm: "", // 空文字列 = 検索なし
};
