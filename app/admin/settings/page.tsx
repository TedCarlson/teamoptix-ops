import ComingSoon from '../../_components/ComingSoon'

export default function Page() {
    return (
        <ComingSoon
            title="Admin: Settings"
            bullets={[
                'Role + scope controls (roster_v2).',
                'RLS scaffolding: Super Admin → Admin → User.',
            ]}
        />
    )
}
