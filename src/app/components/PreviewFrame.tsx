type Props = {
  url: string;
};

export function PreviewFrame({ url }: Props) {
  return (
    <section className="preview-frame" aria-label="Strudel editor">
      <iframe
        title="Strudel live editor"
        src={url}
        loading="eager"
        allow="autoplay; clipboard-read; clipboard-write; midi"
      />
    </section>
  );
}
