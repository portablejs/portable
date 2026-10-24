import groups from '../../packages.json' with { type: 'json' }

const base = import.meta.env.BASE_URL

const code = (text: string) =>
  text.split(/`([^`]+)`/).map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))

export function Home() {
  return (
    <div className="home">
      <section className="home-hero">
        <header className="home-header">
          <div className="home-brand">
            <img className="home-logo home-logo-light" src={`${base}logo-light.svg`} alt="" />
            <img className="home-logo home-logo-dark" src={`${base}logo-dark.svg`} alt="" />
            Portable
          </div>
          <nav>
            <a href={`${base}getting-started`}>Docs</a>
            <a href="https://github.com/portablejs/portable">GitHub</a>
          </nav>
        </header>
        <h1>Web-standard building blocks for any JavaScript runtime.</h1>
        <p>
          Small packages built only on Web Streams, <code>Uint8Array</code>, <code>fetch</code>, and{' '}
          <code>crypto.subtle</code>. The same code runs in browsers, Cloudflare Workers, Bun, and
          Node 24+.
        </p>
        <div className="home-cta">
          <a href={`${base}getting-started`}>Get started</a>
          <code>npm i @portable/streams</code>
        </div>
      </section>
      {groups.map((group) => (
        <section key={group.title}>
          <h2>{group.title}</h2>
          {group.items.map((item) => (
            <a className="home-row" key={item.name} href={`${base}packages/${item.name}`}>
              <code>{item.name}</code>
              <p>
                {code(item.description)}
                {item.replaces && <small>Replaces {code(item.replaces)}</small>}
              </p>
            </a>
          ))}
        </section>
      ))}
      <footer className="home-footer">MIT License</footer>
    </div>
  )
}
