interface PlatformAdminPlaceholderProps {
  title: string;
  description: string;
  capabilities: string[];
}

export function PlatformAdminPlaceholder(props: PlatformAdminPlaceholderProps) {
  return (
    <section className="module-placeholder">
      <div>
        <h2>{props.title}</h2>
        <p>{props.description}</p>
      </div>
      <ul>
        {props.capabilities.map((capability) => (
          <li key={capability}>{capability}</li>
        ))}
      </ul>
    </section>
  );
}
