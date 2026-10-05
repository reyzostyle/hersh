import { useState } from 'react';
import { StealCard } from './StealCard';
import { DailyStack } from './DailyStack';
import type { CompetitorIdea } from '../lib/competitors';
import { StealProgress } from './StealProgress';
import { Page, PageHead, Panel, Row, Section, Skeleton, Button, Empty, Tile } from './Page';

// Dev-only: the design system on one page, for approving before it spreads.
// Mock data on a real Short.
const SAMPLE = {
  video_id: 'fq9MMsCeNhw',
  video_thumbnail: 'https://i.ytimg.com/vi/fq9MMsCeNhw/sddefault.jpg',
  video_views: 2_163_385,
  channel_name: 'mint.chippie',
  outline: { hook: 'Rank 1 Steve vs Rank 100 Warden. Only one walks out.', sections: [], cta: '' },
};

const SWATCHES: [string, string, string][] = [
  ['Page', 'var(--bg-app)', '#0A0A0B'],
  ['Plate', 'var(--bg-raised)', '#141414'],
  ['Plate hover', 'var(--bg-raised-hover)', '#1C1C1C'],
  ['Text', 'var(--text)', '#FAFAFA · 19:1'],
  ['Secondary', 'var(--text-muted)', '#9D9D9E · 7.3:1'],
  ['Tertiary', 'var(--text-faint)', '#808081 · 5.0:1'],
  ['Worked', 'var(--process)', 'outliers, success'],
];

// The daily drop with real Shorts, so the swipe can be tried without a build.
const DROP: CompetitorIdea[] = ([
  ['Y1s03EY3UCk', 'Olympus Stuff', 31, 'When you join a new server as a noob', 2_400_000],
  ['2cYF74YMmGc', 'Alexa Real', 20, 'How different players build their first house', 1_100_000],
  ['EocsE3pFnAI', 'Caylus', 17, 'GTA 6 physics, but in real life', 5_300_000],
  ['0JZtdAtJiyk', 'InsiderForce', 110, '3 AI tools that make my edits look pro', 870_000],
] as const).map(([video_id, channel_name, outlier_score, pitch, video_views]) => ({
  id: video_id, video_id, channel_id: video_id, channel_name, outlier_score, pitch, fit: 'yes', video_views,
  video_title: null, video_thumbnail: null, video_published_at: null, concept: null, adapted_idea: null,
  outline: null, script: null, liked: null, project_id: null, created_at: '',
}));

function DropDemo() {
  const [ideas, setIdeas] = useState(DROP);
  const rule = (id: string, liked: boolean) => setIdeas(prev => prev.map(i => i.video_id === id ? { ...i, liked } : i));
  return (
    <>
      <DailyStack
        remaining={ideas.filter(i => i.liked == null)}
        total={ideas.length}
        nextAt={null}
        loading={false}
        onSave={i => rule(i.video_id, true)}
        onDismiss={i => rule(i.video_id, false)}
        onOpen={() => {}}
      />
      <Button variant="text" size="sm" className="mx-auto flex" onClick={() => setIdeas(DROP)}>Reset</Button>
    </>
  );
}

export function StealLab() {
  return (
    <Page>
      <PageHead eyebrow="Design system" title="One language." tagline="Every screen speaks it." subtitle="Everything below is the real component, not a picture of one." />

      <Section label="Daily drop">
        <DropDemo />
      </Section>

      <Section label="Type">
        <Panel>
          <p className="t-display">Steal what's working</p>
          <p className="t-title mt-4">Ideas for you <span className="t-quiet">from your niche</span></p>
          <p className="t-heading mt-4">Section heading</p>
          <p className="t-body mt-2" style={{ color: 'var(--text-muted)' }}>Body text, 15 on 22. What you read in a chat reply or a description.</p>
          <p className="t-small mt-2" style={{ color: 'var(--text-muted)' }}>Small, 13 on 20. Metadata, captions, anything that explains.</p>
          <p className="t-label mt-2" style={{ color: 'var(--text-muted)' }}>Label, 12 medium</p>
        </Panel>
      </Section>

      <Section label="Colour">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {SWATCHES.map(([name, v, note]) => (
            <Panel key={name} padded={false} className="overflow-hidden">
              <div className="h-14" style={{ background: v, boxShadow: 'inset 0 -1px 0 var(--line)' }} />
              <div className="p-3">
                <p className="t-small" style={{ color: 'var(--text)' }}>{name}</p>
                <p className="t-label" style={{ color: 'var(--text-faint)' }}>{note}</p>
              </div>
            </Panel>
          ))}
        </div>
      </Section>

      <Section label="Buttons">
        <Panel className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Steal it</Button>
          <Button variant="secondary">Build outline</Button>
          <Button variant="ghost">Dismiss</Button>
          <Button variant="text">Cancel</Button>
          <Button variant="primary" size="sm">Small</Button>
          <Button variant="secondary" size="sm">Small</Button>
          <Button variant="primary" disabled>Disabled</Button>
        </Panel>
      </Section>

      <Section label="Rows and tiles">
        <div className="row-list">
          <Row title="Ideas" subtitle="Shorts beating their channel, rebuilt for yours." onClick={() => {}} />
          <Row title="Chat" subtitle="Talk any video, idea or script through." onClick={() => {}} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-2.5">
          <Tile label="Ideas saved" value="23" sub="+4 this week" />
          <Tile label="Credits" value="299" />
        </div>
      </Section>

      <Section label="Loading">
        <Panel className="flex flex-col gap-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </Panel>
      </Section>

      <Section label="Empty">
        <Empty>Nothing saved yet. Press Save on an idea and it lands here.</Empty>
      </Section>

      <Section label="Steal">
        <div className="flex flex-wrap gap-6 items-start">
          <div className="w-[340px] max-w-full rounded-[28px]" style={{ background: 'var(--bg-raised)' }}><StealProgress /></div>
          <StealCard idea={SAMPLE} multiplier={31} onOpen={() => {}} />
        </div>
      </Section>
    </Page>
  );
}
