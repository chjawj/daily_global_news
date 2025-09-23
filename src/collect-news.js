const { Client } = require('@notionhq/client');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

// API 클라이언트 초기화
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function searchSemiconductorNews(limit = 8) {
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

async function searchAINews(limit = 8) {
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

async function searchStartupInvestmentNews(limit = 8) {
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
  const prompt = `다음 뉴스들을 분석해서 아래 3개 카테고리에서 총 5개의 뉴스를 선별하고 요약해주세요.

**선별 기준:**
1. **반도체 산업 뉴스** (1-3개 선택)
   - 설계/제조/장비/소재 관련 주요 기사
   - 기업 인수합병, 투자 동향, 공급망 이슈 포함
   - 어제 제공한 기사/이슈와 중복되지 않는 새로운 내용 우선

2. **AI 알고리즘/산업 동향** (1-3개 선택)  
   - 최신 연구 발표, 오픈소스 릴리즈, 산업 적용 사례
   - 매일 다른 연구/기업/적용 사례를 우선적으로 제공

3. **스타트업/투자 관련** (1-3개 선택)
   - 글로벌 스타트업 투자 동향, M&A, IPO 관련 기사  
   - 동일한 회사/사건 반복은 피하고 새로운 투자 흐름을 강조

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

### 🔬 반도체 산업
#### [뉴스 제목]
- **핵심 내용**: [1-2줄 요약]
- **영향**: [산업/시장에 미치는 영향]
- **출처**: [출처명] - [URL]

### 🤖 AI/알고리즘 동향  
#### [뉴스 제목]
- **핵심 내용**: [1-2줄 요약]
- **기술적 의미**: [기술 발전/적용 관점에서의 의미]
- **출처**: [출처명] - [URL]

### 💰 스타트업/투자
#### [뉴스 제목]  
- **핵심 내용**: [1-2줄 요약]
- **투자 시사점**: [투자 트렌드/시장 변화 관점]
- **출처**: [출처명] - [URL]

정확히 5개만 선별하되, 각 카테고리에서 1-3개씩 균형있게 선택해주세요. 새로운 내용과 다양성을 우선시해주세요.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
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
  
  // 1. 전문 카테고리별 뉴스 검색
  console.log('🔬 반도체 산업 뉴스 검색 중...');
  const semiconductorNews = await searchSemiconductorNews(8);
  
  console.log('🤖 AI/알고리즘 동향 뉴스 검색 중...');
  const aiNews = await searchAINews(8);
  
  console.log('💰 스타트업/투자 뉴스 검색 중...');
  const startupNews = await searchStartupInvestmentNews(8);
  
  const allNews = [...semiconductorNews, ...aiNews, ...startupNews];
  console.log(`📊 총 ${allNews.length}개의 뉴스를 수집했습니다.`);
  
  if (allNews.length === 0) {
    console.log('❌ 수집된 뉴스가 없습니다.');
    return;
  }
  
  // 2. Claude로 전문 카테고리별 요약
  console.log('🤖 Claude가 전문 뉴스를 분석하고 요약 중...');
  const summary = await summarizeWithClaude(allNews);
  
  // 3. Notion에 추가
  console.log('📝 Notion 페이지에 추가 중...');
  await addToNotion(summary);
  
  console.log('✨ 모든 작업이 완료되었습니다!');
}

// 스크립트 실행
main().catch(console.error);