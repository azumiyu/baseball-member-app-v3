function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

async function addImageMargin(
  blob: Blob,
  margin: number,
  padding: number,
): Promise<Blob> {
  const imageUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));
      img.src = imageUrl;
    });

    const width = image.naturalWidth;
    const height = image.naturalHeight;

    const canvas = document.createElement("canvas");
    canvas.width = width + (margin + padding) * 2;
    canvas.height = height + (margin + padding) * 2;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvasの取得に失敗しました。");
    }

    const outerRadius = 0;
    const innerRadius = 18;

    // ① 全体を角丸でクリップ
    context.save();
    roundedRectPath(context, 0, 0, canvas.width, canvas.height, outerRadius);
    context.clip();

    // ② 外側の背景
    context.fillStyle = "#718396";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();

    // ③ 内側の白枠を角丸で描画
    roundedRectPath(
      context,
      margin,
      margin,
      width + padding * 2,
      height + padding * 2,
      innerRadius,
    );
    context.fillStyle = "#ffffff";
    context.fill();

    // ④ 元画像を描画
    context.drawImage(
      image,
      margin + padding,
      margin + padding,
      width,
      height,
    );

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("画像生成に失敗しました。"));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

/** オーダーの表示をPNGに変換し、保存用の余白を付ける。 */
export async function generateLineupImage(target: HTMLElement): Promise<Blob> {
  target.classList.add("capture-mode");
  try {
    const { toBlob } = await import("html-to-image");
    const blob = await toBlob(target, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
      filter: (node) =>
        !(node instanceof HTMLElement && node.dataset.captureHide === "true"),
    });
    if (!blob) throw new Error("PNG画像を生成できませんでした。");
    return await addImageMargin(blob, 32, 32);
  } finally {
    target.classList.remove("capture-mode");
  }
}
