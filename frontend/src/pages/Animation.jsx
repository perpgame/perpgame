import Aurora from '../components/Aurora'
import SynapseViz from '../components/SynapseViz'

export default function Animation() {
  return (
    <>
      <Aurora colorStops={['#00D4AA', '#b5efdc', '#00D4AA']} amplitude={0.5} blend={0.1} speed={0.3} />
      <div style={{ position: 'fixed', inset: '-20%', zIndex: 1 }}>
        <SynapseViz style={{ width: '100%', height: '100%' }} />
      </div>
    </>
  )
}
