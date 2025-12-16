import ComingSoon from '../../_components/ComingSoon'

export default async function Page(props: { params: Promise<{ region: string }> }) {
  const { region } = await props.params
  return (
    <ComingSoon
      title={`Region Report: ${decodeURIComponent(region)}`}
      bullets={[
        'Region-scoped report surface (future).',
        'Regional PDF/email actions later.',
      ]}
    />
  )
}
