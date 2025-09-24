const { Client } = require('@notionhq/client');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

// API 클라이언트 초기화
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function searchSemiconductorNews(limit = 4) { // 8 → 4로 줄임
  try {
    const response = await axios.get('https://newsdata.io/api/1/latest', {
      params: {
        apikey: process.env.NEWSDATA_API_KEY,
        q: 'semiconductor OR chip OR TSMC OR Intel OR "chip shortage"',
        language: 'en',
        size: limit
      }
    });
    
    console.log(`🔬 반도체 뉴스 ${response.data.results?.length || 0}개 수집`);
    return response.data.results || [];
  } catch (error) {
    console.error('반도체 뉴스 검색 오류:', error.response?.status, error.response?.statusText);
    console.error('에러 상세:', error.response?.data);
    return [];
  }
}

async function searchAINews(limit = 4) { // 8 → 4로 줄임
  try {
    const response = await axios.get('https://newsdata.io/api/1/latest', {
      params: {
        apikey: process.env.NEWSDATA_API_KEY,
        q: '"artificial intelligence" OR "machine learning" OR GPT OR "AI research"',
        language: 'en',
        size: limit
      }
    });
    
    console.log(`🤖 AI/알고리즘 뉴스 ${response.data.results?.length || 0}개 수집`);
    return response.data.results || [];
  } catch (error) {
    console.error('AI 뉴스 검색 오류:', error.response?.status, error.response?.statusText);
    console.error('에러 상세:', error.response?.data);
    return [];
  }
}

async function searchStartupInvestmentNews(limit = 4) { // 8 → 4로 줄임
  try {
    const response = await axios.get('https://newsdata.io/api/1/latest', {
      params: {
        apikey: process.env.NEWSDATA_API_KEY,
        q: 'startup OR "venture capital" OR IPO OR "Series A" OR funding',
        language: 'en',
        size: limit
      }
    });
    
    console.log(`💰 스타트업/투자 뉴스 ${response.data.results?.length || 0}개 수집`);
    return response.data.results || [];
  } catch (error) {
    console.error('스타트업 뉴스 검색 오류:', error.response?.status, error.response?.statusText);
    return [];
  }
}

async function summarizeWithClaude(newsData) {
  // 토큰 절약을 위해 뉴스 설명을 100자로 제한
  const trimmedNews = newsData.map(item => ({
    ...item,
    description: (item.description || '').substring(0, 100)
  }));

  const prompt = `뉴스 분석 후 3개 카테고리에서 총 5개 선별하여 간결하게 요약:

데이터:
${trimmedNews.map(item => `제목: ${item.title}
설명: ${item.description || ''}
URL: ${item.link}`).join('\n---\n')}

출력 형식:
## 📰 오늘의 뉴스 브리핑 (${new Date().toLocaleDateString('ko-KR')})

반도체 산업
[제목]
- 내용: [1줄 요약]
- 출처: [URL]

AI/알고리즘
[제목] 
- 내용: [1줄 요약]
- 출처: [URL]

투자/스타트업
[제목]
- 내용: [1줄 요약] 
- 출처: [URL]

총 5개 선별 (각 카테고리 1-2개). 간결하게 작성.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500, // 2500 → 1500으로 줄임
      messages: [{ role: 'user', content: prompt }]
    });
    
    return response.content[0].text;
  } catch (error) {
    console.error('Claude 요약 오류:', error.message);
    return '오늘의 뉴스 요약을 생성할 수 없습니다.';
  }
}

async function addToNotion(content) {
  try {
    const parentPageId = process.env.NOTION_PAGE_ID;
    
    // 오늘 날짜로 서브페이지 제목 생성
    const today = new Date();
    const koreaDate = new Date(today.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
    const dateStr = koreaDate.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      weekday: 'short'
    });
    const pageTitle = `📰 ${dateStr} 뉴스 브리핑`;
    
    console.log(`📄 새 페이지 생성 중: ${pageTitle}`);
    
    // 1. 새로운 서브페이지 생성
    const newPage = await notion.pages.create({
      parent: {
        page_id: parentPageId
      },
      properties: {
        title: {
          title: [
            {
              text: {
                content: pageTitle
              }
            }
          ]
        }
      }
    });
    
    console.log(`✅ 새 페이지 생성됨: ${newPage.id}`);
    
    // 2. Markdown을 Notion 블록으로 변환
    const blocks = content.split('\n').filter(line => line.trim()).map(line => {
      if (line.startsWith('## ')) {
        return {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: line.replace('## ', '') } }]
          }
        };
      } else if (line.startsWith('### ')) {
        return {
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ type: 'text', text: { content: line.replace('### ', '') } }]
          }
        };
      } else if (line.startsWith('#### ')) {
        return {
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ type: 'text', text: { content: line.replace('#### ', '') } }]
          }
        };
      } else if (line.startsWith('- ')) {
        return {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ type: 'text', text: { content: line.replace('- ', '') } }]
          }
        };
      } else if (line.trim()) {
        return {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: line } }]
          }
        };
      }
    }).filter(block => block);

    // 3. 새 페이지에 콘텐츠 추가
    await notion.blocks.children.append({
      block_id: newPage.id,
      children: blocks
    });
    
    console.log(`✅ 새 서브페이지에 콘텐츠 추가 완료: ${pageTitle}`);
  } catch (error) {
    console.error('Notion 업데이트 오류:', error.message);
    console.error('에러 상세:', error);
  }
}

async function main() {
  console.log('🚀 일일 뉴스 수집을 시작합니다...');
  
  // 1. 전문 카테고리별 뉴스 검색 (토큰 절약을 위해 4개씩 수집)
  console.log('🔬 반도체 산업 뉴스 검색 중...');
  const semiconductorNews = await searchSemiconductorNews(4);
  
  console.log('🤖 AI/알고리즘 동향 뉴스 검색 중...');
  const aiNews = await searchAINews(4);
  
  console.log('💰 스타트업/투자 뉴스 검색 중...');
  const startupNews = await searchStartupInvestmentNews(4);
  
  const allNews = [...semiconductorNews, ...aiNews, ...startupNews];
  console.log(`📊 총 ${allNews.length}개의 뉴스를 수집했습니다. (토큰 절약 모드)`);
  
  if (allNews.length === 0) {
    console.log('❌ 수집된 뉴스가 없습니다.');
    return;
  }
  
  // 2. Claude로 전문 카테고리별 요약 (간결한 프롬프트)
  console.log('🤖 Claude가 전문 뉴스를 분석하고 요약 중...');
  const summary = await summarizeWithClaude(allNews);
  
  // 3. Notion에 새 서브페이지 생성 후 추가
  console.log('📝 Notion에 새 서브페이지 생성 및 추가 중...');
  await addToNotion(summary);
  
  console.log('✨ 모든 작업이 완료되었습니다!');
}

// 스크립트 실행
main().catch(console.error);