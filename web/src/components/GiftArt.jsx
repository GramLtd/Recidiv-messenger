/** Renders a regular gift or a collectible (backdrop gradient + symbol pattern + model). */
export function GiftArt({ userGift, gift, size = 80, rounded = 16, style }) {
  const g = gift || userGift?.gift;
  const col = userGift?.collectible;
  if (!col) {
    return (
      <div className="center" style={{ width: size, height: size, ...style }}>
        {g?.image ? <img src={g.image} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} /> : <span className="gift-emoji" style={{ fontSize: size * 0.62 }}>{g?.emoji}</span>}
      </div>
    );
  }
  return <CollectibleArt col={col} size={size} rounded={rounded} style={style} />;
}

export function CollectibleArt({ col, size = 200, rounded = 16, style, height }) {
  const { backdrop, symbol, model } = col;
  const h = height || size;
  return (
    <div
      className="collectible-art"
      style={{
        width: typeof size === 'number' ? size : size,
        height: h,
        borderRadius: rounded,
        background: `radial-gradient(circle at 50% 45%, ${backdrop?.center || '#444'} 0%, ${backdrop?.edge || '#000'} 85%)`,
        ...style,
      }}
    >
      <div className="pattern" style={{ fontSize: (typeof h === 'number' ? h : 200) * 0.09 }}>
        {Array.from({ length: 36 }).map((_, i) => (
          <span key={i} style={{ filter: 'none', opacity: i % 2 ? 0.8 : 1, transform: `rotate(${(i * 37) % 40 - 20}deg)` }}>
            {symbol?.emoji}
          </span>
        ))}
      </div>
      <span className="model gift-emoji" style={{ fontSize: (typeof h === 'number' ? h : 200) * 0.5, filter: `${model?.filter || ''} drop-shadow(0 10px 24px rgba(0,0,0,.5))` }}>
        {model?.emoji}
      </span>
    </div>
  );
}
