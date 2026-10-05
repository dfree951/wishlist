'use client';
export default function ErrorPage({reset}:{reset:()=>void}) {
  return <main className="error-page"><h1>The list couldn’t be loaded.</h1><p>Please try again in a moment.</p><button className="button" onClick={reset}>Try again</button></main>;
}
