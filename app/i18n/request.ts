import {getRequestConfig} from 'next-intl/server';
import {cookies} from 'next/headers';
 
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const selected = cookieStore.get('locale')?.value;
  const locale = selected === 'en' ? 'en' : 'th';

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default
  };
});