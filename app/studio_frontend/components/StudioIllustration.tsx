function vuMeterColor(j: number): string {
  if (j > 5) return 'hsl(0 84% 60%)'
  if (j > 3) return 'hsl(45 93% 58%)'
  return 'hsl(142 70% 45%)'
}

function rackLedColor(i: number): string {
  if (i === 0) return 'hsl(142 70% 45%)'
  if (i === 2) return 'hsl(45 93% 58%)'
  return 'hsl(220 14% 25%)'
}

function RoomShell() {
  return (
    <>
      <rect x="0" y="340" width="800" height="140" fill="hsl(220 14% 8%)" />
      <rect x="0" y="0" width="800" height="340" fill="hsl(220 14% 11%)" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={`lp-${i}`} x={20} y={40 + i * 72} width={40} height={60} rx="3"
          fill="hsl(220 14% 16%)" stroke="hsl(220 14% 22%)" strokeWidth="1" />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <rect key={`rp-${i}`} x={740} y={40 + i * 72} width={40} height={60} rx="3"
          fill="hsl(220 14% 16%)" stroke="hsl(220 14% 22%)" strokeWidth="1" />
      ))}
    </>
  )
}

function StudioMonitor({ x }: Readonly<{ x: number }>) {
  const cx = x + 45
  return (
    <>
      <rect x={x} y="160" width="90" height="130" rx="6" fill="hsl(220 14% 18%)" stroke="hsl(220 14% 28%)" strokeWidth="1.5" />
      <circle cx={cx} cy="210" r="28" fill="hsl(220 14% 10%)" stroke="hsl(220 14% 30%)" strokeWidth="1.5" />
      <circle cx={cx} cy="210" r="16" fill="hsl(220 14% 22%)" />
      <circle cx={cx} cy="210" r="6" fill="hsl(220 14% 30%)" />
      <rect x={cx - 17} y="258" width="34" height="12" rx="3" fill="hsl(220 14% 14%)" />
      <circle cx={cx} cy="276" r="4" fill="hsl(142 70% 45%)" opacity="0.9" />
      <rect x={cx - 10} y="288" width="20" height="14" rx="2" fill="hsl(220 14% 16%)" />
      <rect x={cx - 25} y="299" width="50" height="4" rx="2" fill="hsl(220 14% 20%)" />
      <ellipse cx={cx} cy="165" rx="60" ry="15" fill="hsl(217 91% 60%)" opacity="0.04" />
    </>
  )
}

function VuMeters() {
  return (
    <>
      {[0, 1].map((i) => (
        <g key={`vu-${i}`}>
          <rect x={688 + i * 14} y={240} width={10} height={54} rx="1" fill="hsl(220 14% 10%)" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((j) => (
            <rect key={j} x={689 + i * 14} y={286 - j * 6} width={8} height={4} rx="0.5"
              fill={vuMeterColor(j)}
              opacity={j < 5 ? 0.9 : 0.4}
            />
          ))}
        </g>
      ))}
    </>
  )
}

function MixingConsole() {
  return (
    <>
      <rect x="90" y="300" width="620" height="18" rx="3" fill="hsl(220 14% 20%)" stroke="hsl(220 14% 30%)" strokeWidth="1" />
      <rect x="120" y="230" width="560" height="72" rx="4" fill="hsl(220 14% 15%)" stroke="hsl(220 14% 25%)" strokeWidth="1.5" />
      {Array.from({ length: 16 }, (_, i) => {
        const x = 138 + i * 33
        const faderH = 20 + Math.sin(i * 1.3) * 14
        return (
          <g key={`ch-${i}`}>
            <rect x={x} y={240} width={18} height={54} rx="2" fill="hsl(220 14% 12%)" />
            <rect x={x + 2} y={244 + (34 - faderH)} width={14} height={faderH} rx="1"
              fill={i % 4 === 0 ? 'hsl(217 91% 60%)' : 'hsl(220 14% 28%)'} opacity="0.8" />
            <rect x={x + 3} y={242 + (34 - faderH)} width={12} height={6} rx="1"
              fill="hsl(220 14% 40%)" />
          </g>
        )
      })}
      <rect x="650" y="238" width="22" height="54" rx="2" fill="hsl(220 14% 12%)" />
      <rect x="652" y="248" width="18" height="30" rx="1" fill="hsl(217 91% 60%)" opacity="0.6" />
      <rect x="653" y="246" width="16" height={6} rx="1" fill="hsl(220 14% 50%)" />
      <VuMeters />
    </>
  )
}

function ComputerScreen() {
  return (
    <>
      <rect x="300" y="110" width="200" height="130" rx="6" fill="hsl(220 14% 13%)" stroke="hsl(220 14% 25%)" strokeWidth="1.5" />
      <rect x="308" y="118" width="184" height="110" rx="3" fill="hsl(220 14% 8%)" />
      <rect x="312" y="122" width="176" height="70" rx="2" fill="hsl(220 14% 6%)" />
      {Array.from({ length: 44 }, (_, i) => {
        const h = 6 + Math.abs(Math.sin(i * 0.7 + 1) * Math.cos(i * 0.3) * 22)
        return (
          <rect key={i} x={314 + i * 4} y={157 - h / 2} width={3} height={h} rx="0.5"
            fill="hsl(217 91% 65%)" opacity="0.75" />
        )
      })}
      <line x1="400" y1="122" x2="400" y2="192" stroke="hsl(0 84% 65%)" strokeWidth="1.5" opacity="0.9" />
      <rect x="340" y="198" width="120" height="18" rx="3" fill="hsl(220 14% 12%)" />
      {['◀◀', '▶', '■', '●'].map((sym, i) => (
        <text key={sym} x={352 + i * 28} y={211} fontSize="8"
          fill={i === 3 ? 'hsl(0 84% 60%)' : 'hsl(220 14% 55%)'} textAnchor="middle">
          {sym}
        </text>
      ))}
      <rect x="390" y="238" width="20" height="8" rx="2" fill="hsl(220 14% 18%)" />
      <rect x="375" y="244" width="50" height="4" rx="2" fill="hsl(220 14% 20%)" />
      <ellipse cx="400" cy="245" rx="100" ry="10" fill="hsl(217 91% 60%)" opacity="0.05" />
    </>
  )
}

function RackUnit() {
  return (
    <>
      <rect x="700" y="160" width="60" height="140" rx="4" fill="hsl(220 14% 14%)" stroke="hsl(220 14% 24%)" strokeWidth="1" />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={`rack-${i}`}>
          <rect x="703" y={163 + i * 27} width="54" height="24" rx="2"
            fill="hsl(220 14% 18%)" stroke="hsl(220 14% 26%)" strokeWidth="0.5" />
          <circle cx="715" cy={175 + i * 27} r="4" fill="hsl(220 14% 12%)" stroke="hsl(220 14% 28%)" strokeWidth="0.5" />
          <rect x="724" y={171 + i * 27} width="24" height="8" rx="1" fill="hsl(220 14% 12%)" />
          <circle cx="748" cy={175 + i * 27} r="2.5" fill={rackLedColor(i)} />
        </g>
      ))}
    </>
  )
}

function Keyboard() {
  return (
    <>
      <rect x="240" y="305" width="320" height="22" rx="3" fill="hsl(220 14% 22%)" stroke="hsl(220 14% 30%)" strokeWidth="1" />
      {Array.from({ length: 40 }, (_, i) => (
        <rect key={i} x={243 + i * 7.8} y={307} width={7} height={18} rx="1"
          fill="hsl(220 14% 28%)" stroke="hsl(220 14% 18%)" strokeWidth="0.5" />
      ))}
      {[0, 1, 3, 4, 5, 7, 8, 10, 11, 12, 14, 15, 17, 18, 19, 21, 22, 24, 25].map((i) => (
        <rect key={`bk-${i}`} x={247 + i * 7.8} y={307} width={5} height={11} rx="1"
          fill="hsl(220 14% 10%)" />
      ))}
    </>
  )
}

function Accessories() {
  return (
    <>
      <path d="M 95 310 Q 105 280 115 310" stroke="hsl(220 14% 35%)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="90" y="308" width="10" height="16" rx="4" fill="hsl(220 14% 28%)" />
      <rect x="114" y="308" width="10" height="16" rx="4" fill="hsl(220 14% 28%)" />
      <rect x="680" y="292" width="20" height="22" rx="3" fill="hsl(220 14% 22%)" stroke="hsl(220 14% 32%)" strokeWidth="1" />
      <path d="M 700 298 Q 710 300 700 308" stroke="hsl(220 14% 32%)" strokeWidth="1.5" fill="none" />
      <rect x="682" y="292" width="16" height="5" rx="1" fill="hsl(25 85% 55%)" opacity="0.7" />
    </>
  )
}

export function StudioIllustration({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      viewBox="0 0 800 480"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Music studio illustration"
    >
      <RoomShell />
      <StudioMonitor x={130} />
      <StudioMonitor x={580} />
      <MixingConsole />
      <ComputerScreen />
      <RackUnit />
      <Keyboard />
      <Accessories />
    </svg>
  )
}
