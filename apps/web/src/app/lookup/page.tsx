import AddressInput from '@/components/AddressInput';

export default function LookupPage() {
  return (
    <div className="relative min-h-[calc(100vh-8rem)] flex items-center justify-center px-5">
      {/* Ambient glow */}
      <div
        className="absolute top-[20%] left-[40%] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(177,210,53,0.06) 0%, transparent 60%)' }}
      />

      <div className="max-w-2xl w-full mx-auto">
        <div className="text-center mb-10">
          <p
            className="mb-3"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(177,210,53,0.60)',
            }}
          >
            Collection Lookup
          </p>
          <h1
            className="text-4xl sm:text-5xl font-black"
            style={{ letterSpacing: '-0.04em', color: '#F2F4F3' }}
          >
            Look up your <span className="text-gradient">collection</span>
          </h1>
          <p className="mt-4 max-w-lg mx-auto" style={{ color: 'rgba(242,244,243,0.40)', fontSize: '16px' }}>
            Paste your Courtyard wallet address to see your graded slabs, set progress, and estimated value.
          </p>
        </div>

        <AddressInput />

        <div
          className="flex flex-wrap items-center justify-center gap-2.5 mt-8"
        >
          {['PSA', 'CGC', 'BGS', 'SGC', 'Courtyard'].map((label) => (
            <span
              key={label}
              className="pill"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
