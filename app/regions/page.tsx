import ComingSoon from '../_components/ComingSoon'

export default function Page() {
    return (
        <ComingSoon
            title="Regions"
            bullets={[
                'Region directory/picker.',
                'Links into /region/[region].',
                'Later: pull from known-region source of truth in DB.',
            ]}
        />
    )
}
