<template>
  <main class="step-detail">
    <RouterLink to="/student/learning-paths">← 返回学习路径</RouterLink>
    <p v-if="error" class="error">{{ error }}</p><p v-else-if="!step">正在加载步骤…</p>
    <template v-else><h1>{{ step.title }}</h1><p>{{ step.description || step.learning_activity }}</p><p>知识点：{{ step.knowledge_point || step.knowledge_points.join('、') }}</p><p>预计 {{ step.estimated_minutes }} 分钟 · 及格线 {{ step.pass_score }} 分</p>
      <a :href="videoUrl" target="_blank" rel="noopener noreferrer" :aria-label="`在 Bilibili 搜索 ${step.title} 讲解视频`">在 Bilibili 搜索讲解视频</a>
      <button v-if="['active','learning'].includes(step.status)" :disabled="busy" @click="finishStudy">完成本步学习</button>
      <button v-if="step.status === 'quiz_required'" :disabled="busy" @click="startQuiz">进入正式测验</button>
    </template>
  </main>
</template>
<script setup lang="ts">
import { computed,onMounted,ref } from 'vue'; import { useRoute,useRouter } from 'vue-router'; import { completeLearningPathStep,generateStepQuiz,getLearningPath,type LearningPathStep } from '@/api/learningPaths'
const route=useRoute(),router=useRouter(),step=ref<LearningPathStep|null>(null),error=ref(''),busy=ref(false); const pathId=Number(route.params.pathId),stepId=Number(route.params.stepId); const videoUrl=computed(()=>`https://search.bilibili.com/all?keyword=${encodeURIComponent(`${step.value?.knowledge_point||step.value?.title||''} 讲解`)}`)
async function load(){try{const path=await getLearningPath(pathId);const found=path.path_steps.find(item=>item.id===stepId);if(!found)throw new Error('步骤不存在');if(found.status==='locked')throw new Error('该步骤尚未解锁');step.value=found}catch(cause){error.value=cause instanceof Error?cause.message:'步骤加载失败'}}
async function finishStudy(){busy.value=true;try{await completeLearningPathStep(pathId,stepId,{});await load()}finally{busy.value=false}}
async function startQuiz(){if(!step.value)return;busy.value=true;try{const result=await generateStepQuiz(pathId,{step_index:step.value.step_index,question_count:5,difficulty:'normal'});if(result.test_id)await router.push(`/student/tests?testId=${result.test_id}`)}finally{busy.value=false}}
onMounted(load)
</script>
<style scoped>.step-detail{max-width:900px;margin:auto;padding:40px}.step-detail>*{margin:14px}.error{color:#d33}</style>
