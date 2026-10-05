'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { isEntryTap, movedBeyondTap, type EntryTap } from '@/lib/entry-tap';

const label = (back: boolean) => back ? 'Sign In' : 'View wish list';

function EntryLink({ back }: { back: boolean }) {
  const tap = useRef<EntryTap | null>(null);
  const navigating = useRef(false);
  return <a className="button" href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}${back ? '/manage/' : '/gifts/'}`} draggable={false}
    onPointerDown={event => {
      event.stopPropagation();
      navigating.current = false;
      tap.current = null;
      if (event.pointerType !== 'touch' || !event.isPrimary) return;
      tap.current = { id: event.pointerId, x: event.clientX, y: event.clientY,
        startedAt: Date.now(), href: event.currentTarget.href, moved: false };
    }}
    onPointerMove={event => {
      const start = tap.current;
      if (start && movedBeyondTap(start, event.clientX, event.clientY)) start.moved = true;
    }}
    onPointerCancel={() => { tap.current = null; }}
    onPointerUp={event => {
      event.stopPropagation();
      const start = tap.current;
      tap.current = null;
      if (!start || !isEntryTap(start, event.pointerId, event.clientX, event.clientY, Date.now())) return;
      event.preventDefault();
      navigating.current = true;
      window.location.assign(start.href);
    }}
    onClick={event => {
      // A phone may also synthesize a click after the touch already navigated.
      if (navigating.current && event.detail !== 0) event.preventDefault();
    }}>{label(back)}</a>;
}

export function EntryPage() {
  const [back, setBack] = useState(false);
  const [flip, setFlip] = useState<{ direction: number } | null>(null);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!flip) return;
    // Also finish when reduced motion disables the CSS animation.
    const timer = window.setTimeout(() => setFlip(null), 550);
    return () => window.clearTimeout(timer);
  }, [flip]);

  function turn(direction: number) {
    if (flip) return;
    setFlip({ direction });
    setBack(value => !value);
  }

  function finishSwipe(event: PointerEvent<HTMLElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    turn(Math.sign(dx));
  }

  return <div className="app-shell entry-shell">
    <main id="main-content" className="entry-page" tabIndex={-1}
      aria-label="Syd and Dan Wish List. Use left or right arrow keys to turn the page."
      onKeyDown={event => {
        if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        turn(event.key === 'ArrowLeft' ? -1 : 1);
      }}
      onPointerDown={event => {
        gesture.current = null;
        if (!event.isPrimary || event.button !== 0) return;
        if (event.target instanceof Element && event.target.closest('a, button')) return;
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }}
      onPointerMove={event => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = Math.abs(event.clientX - start.x);
        const dy = Math.abs(event.clientY - start.y);
        if (dx >= 60 && dx > dy * 1.5) event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={finishSwipe}
      onPointerCancel={() => { gesture.current = null; }}>
      <div className="entry-stage">
        <section className={`entry-content${flip ? ' entry-flipping' : ''}`}
          style={{ '--turn': `${(flip?.direction ?? 1) * -90}deg` } as CSSProperties}
          onAnimationEnd={() => setFlip(null)}>
          <h1><span>Syd &amp; Dan</span>{' '}<span>Wish List</span></h1>
          <div className="entry-actions">
            <EntryLink back={back}/>
          </div>
        </section>
      </div>
    </main>
  </div>;
}
