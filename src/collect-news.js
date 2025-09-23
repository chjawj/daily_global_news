const { Client } = require('@notionhq/client');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

// API 클라이언트 초기화
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function searchGlobalNews(limit = 10) {
  try {
    const response = await axios.get('https://newsdata.io/api/1/latest', {
      params: {
        apikey: process.env.NEWSDATA_API_KEY,
        category: 'world,politics',
        language: 'en',
        size: limit
      }
    });
    
    console.log(`📰 글로벌 뉴스 ${response.data.results?.length || 0}개 수집`);
    return response.data.results || [];
  } catch (error) {
    console.error('글로벌 뉴스 검색 오류:', error.response?.status, error.response?.statusText);
    console.error('에러 상세:', error.response?.data);
    return [];
  }
}

async function searchTechNews(limit = 10) {
  try {
    const response = await axios.get('https://newsdata.io/api/1/latest', {
      params: {
        apikey: process.env.NEWSDATA_API_KEY,
        q: 'technology OR AI OR "artificial intelligence" OR startup OR blockchain',
        language: 'en',
        size: limit
      }
    });
    
    console.log(`💻 기술 뉴스 ${response.data.results?.length || 0}개 수집`);
    return response.data.results || [];
  } catch (error) {
    console.error('기술 뉴스 검색 오류:', error.response?.status, error.response?.statusText);
    console.error('에러 상세:', error.response?.data);
    return [];
  }
}

async function searchBusinessNews(limit = 10) {
  try {
    const response = await axios.get('https://newsdata.io/api/1/latest', {
      params: {
        apikey: process.env.NEWSDATA_API_KEY,
        category: 'business',
        language: 'en',
        size: limit
      }
    });
    
    console.log(`💼 비즈니스 뉴스 ${response.data.results?.length || 0}개 수집`);
    return response.data.results || [];
  } catch (error) {
    console.error('비즈니스 뉴스 검색 오류:', error.response?.status, error.response?.statusText);
    return [];
  }
}

async function summarizeWithClaude(newsData) {
  const prompt = `다음 뉴스들을 분석해서 가장 중요한 글로벌 뉴스와 기술 트렌드 5개를 선별하고 요약해주세요.

뉴스 데이터:
${newsData.map(item => `제목: ${item.title}
설명: ${item.description || ''}
URL: ${item.link}
발행시간: ${item.pubDate}
출처: ${item.source_id || 'Unknown'}
카테고리: ${item.category?.join(', ') || 'General'}
`).join('\n---\n')}

다음 형식으로 답변해주세요:
## 📰 오늘의 주요 뉴스 & 기술 트렌드 (${new Date().toLocaleDateString('ko-KR')})

### 1. [뉴스 제목]
- **핵심 내용**: [1-2줄 요약]
- **영향**: [why it matters]
- **출처**: [출처명] - [URL]

### 2. [뉴스 제목]
...

정확히 5개만 선별해주세요. 글로벌 영향력이 큰 뉴스와 최신 기술 트렌드를 우선적으로 선택해주세요.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 2000,
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
    const pageId = process.env.NOTION_PAGE_ID;
    
    // Markdown을 Notion 블록으로 변환하는 간단한 파서
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
    }).filter(block => block); // undefined 블록 제거

    await notion.blocks.children.append({
      block_id: pageId,
      children: blocks
    });
    
    console.log('✅ Notion 페이지에 성공적으로 추가되었습니다!');
  } catch (error) {
    console.error('Notion 업데이트 오류:', error.message);
  }
}

async function main() {
  console.log('🚀 일일 뉴스 수집을 시작합니다...');
  
  // 1. newsdata.io API로 뉴스 검색
  console.log('📰 글로벌 뉴스 검색 중...');
  const globalNews = await searchGlobalNews(8);
  
  console.log('💻 기술 뉴스 검색 중...');
  const techNews = await searchTechNews(8);
  
  console.log('💼 비즈니스 뉴스 검색 중...');
  const businessNews = await searchBusinessNews(4);
  
  const allNews = [...globalNews, ...techNews, ...businessNews];
  console.log(`📊 총 ${allNews.length}개의 뉴스를 수집했습니다.`);
  
  if (allNews.length === 0) {
    console.log('❌ 수집된 뉴스가 없습니다.');
    return;
  }
  
  // 2. Claude로 요약
  console.log('🤖 Claude가 뉴스를 분석하고 요약 중...');
  const summary = await summarizeWithClaude(allNews);
  
  // 3. Notion에 추가
  console.log('📝 Notion 페이지에 추가 중...');
  await addToNotion(summary);
  
  console.log('✨ 모든 작업이 완료되었습니다!');
}

// 스크립트 실행
main().catch(console.error);