import groups from '../../packages.json' with { type: 'json' };

const base = import.meta.env.BASE_URL;

const code = (text: string) =>
  text.split(/`([^`]+)`/).map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));

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
          The web's missing standard library as a set of fast, lightweight, composable packages.
          Write your code once and run it in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.
        </p>
        <div className="home-cta">
          <a href={`${base}getting-started`}>Get started &rarr;</a>
        </div>
      </section>
      {groups.map((group) => (
        <section key={group.title}>
          <h2>{group.title}</h2>
          {group.items.map((item) => (
            <a className="home-row" key={item.name} href={`${base}packages/${item.name}`}>
              <span className="home-name">{item.name}</span>
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
  );
}
