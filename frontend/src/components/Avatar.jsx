function isSafeUrl(url) {
  return /^https?:\/\//.test(url) || url.startsWith('/')
}

export default function Avatar({ address, size = 40, avatarUrl }) {
  if (!address) return null

  if (avatarUrl && isSafeUrl(avatarUrl)) {
    return (
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    )
  }

  return (
    <img
      src={`https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(address)}&size=${size}`}
      alt=""
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
      }}
    />
  )
}
