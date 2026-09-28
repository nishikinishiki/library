# eBook の章見出しと画像ページ

各冊子の `data.js` にある `window.bookMarkdown` で本文を記述します。`#` は章の開始を表し、章名は目次とリーダー上部のタイトルに使われます。

```md
# はじめに {toc-only}
![はじめにの解説ページ](img/intro.webp){page}

# 投資を始める前に
この章では、投資を始める前に確認したいことを説明します。
```

- `# 章名` は本文にも見出しを表示します。
- `# 章名 {toc-only}` は章名を目次と上部のタイトルに残し、本文には見出しを表示しません。画像だけで構成する章に使えます。`{toc-only}` は章見出しの行末に記述してください。
- `![画像の説明](img/intro.webp){page}` は画像を独立した１ページに表示します。画像だけの章でも、各画像に `{page}` を付けます。画像内の情報を読めない人にも内容が伝わるよう、説明文を記述してください。
- `{toc-only}` の章にも本文または画像を入れてください。空の章には、目次から移動できるページがありません。

`{toc-only}` と `{page}` はこのリーダー固有の記法です。通常の Markdown ビューアーでは同じようには表示されません。

## 画像の拡大と表示サイズ

```md
![グラフの説明](img/graph.webp){nozoom}
![大きく表示するグラフの説明](img/large-graph.webp){nozoom size=large}
```

- `{nozoom}` は従来どおり、拡大を無効にして幅75％・最大高さ18vhで表示します。
- `{nozoom size=large}` は拡大を無効にしたまま、幅100％・最大高さ28vhで表示します。仮のサイズは [`shared/style.css`](shared/style.css) の `.book-image-block--size-large` に定義しています。
- `{size=large}` のみを指定すると、大きく表示しつつ、クリックで拡大できます。
- `{page}` は独立した画像ページです。`nozoom` や `size=large` とは組み合わせません。

## 文字サイズボタンの表示

文字サイズの「Aa」ボタンを表示しない冊子では、`data.js` の冒頭に設定します。

```md
---
title: 画像で読む不動産投資
cover: img/cover.webp
fontSizeControl: hidden
---
```

未指定の場合は従来どおり表示します。`fontSizeControl: hidden` はボタンの表示だけを変え、画像の表示方法や保存済みの文字サイズは変更しません。明示的に表示する場合は `fontSizeControl: visible` も指定できます。
