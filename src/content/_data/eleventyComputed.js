// Shared page metadata so <title>, Open Graph and canonical URLs stay in sync.
export default {
    pageTitle: (data) => {
        const title = data.title || data.seo?.title;
        return title ? `${title} : ${data.site.title}` : `${data.site.title} : ${data.site.tagline}`;
    },
    pageDescription: (data) => data.seo?.description || data.description || data.site.description,
};
