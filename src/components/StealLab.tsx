import { StealCard } from './StealCard';
import { StealProgress } from './StealProgress';

// Dev-only bench for the filmable steal card. Mock data on a real Short; the
// multiplier is illustrative until steal-video computes a channel median.
const SAMPLE = {
  video_id: 'fq9MMsCeNhw',
  video_thumbnail: 'https://i.ytimg.com/vi/fq9MMsCeNhw/sddefault.jpg',
  video_views: 2_163_385,
  channel_name: 'mint.chippie',
  outline: { hook: 'Rank 1 Steve vs Rank 100 Warden. Only one walks out.', sections: [], cta: '' },
};

export function StealLab() {
  return (
    <div className="min-h-screen px-6 py-12 flex flex-wrap gap-12 items-start justify-center" style={{ background: '#000' }}>
      <div className="w-[340px] rounded-[28px]" style={{ background: 'var(--bg-raised)' }}><StealProgress /></div>
      <StealCard idea={SAMPLE} multiplier={31} onOpen={() => {}} />
      <StealCard idea={SAMPLE} multiplier={null} onOpen={() => {}} />
    </div>
  );
}
