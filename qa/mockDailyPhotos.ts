// Explicitly prevent OneDrive and real photo APIs in synthetic QA.
export async function loadDailyReportPhotos(){return []}
export async function loadPhotoThumbnails(){return {}}
export async function uploadPhoto():Promise<never>{throw Error('Production photo uploads prohibited in synthetic QA')}
