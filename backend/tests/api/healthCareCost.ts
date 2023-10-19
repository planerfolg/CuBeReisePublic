import test from 'ava'
import { Expense, HealthCareCost, HealthCareCostSimple } from '../../../common/types.js'
import createAgent, { loginHealthCareCost, loginUser } from './_agent.js'
import { objectToFormFields } from './_helper.js'

const agent = createAgent()
await loginUser(agent)

//@ts-ignore
var healthCareCost: HealthCareCostSimple = {
  name: 'Broken leg',
  patient: 'Ben Logas',
  insurance: 'AOK'
}

test.serial('POST /healthCareCost/inWork', async (t) => {
  const res = await agent.post('/api/healthCareCost/inWork').send(healthCareCost)
  healthCareCost = res.body.result
  t.is(res.status, 200)
})

test.serial('GET /healthCareCost', async (t) => {
  t.plan(2)
  const res = await agent.get('/api/healthCareCost')
  t.is(res.status, 200)
  for (const gotHealthCareCost of res.body.data as HealthCareCostSimple[]) {
    if (healthCareCost._id === gotHealthCareCost._id) {
      t.pass()
      break
    }
  }
})

// FILL OUT

const expenses: Expense[] = [
  {
    description: 'Fist medical examination',
    cost: {
      amount: 172, //@ts-ignore
      currency: { _id: 'GBP' }, //@ts-ignore
      receipts: [{ name: 'Medical Center Invoice-82878903.pdf', type: 'application/pdf', data: 'tests/files/dummy.pdf' }],
      date: new Date('2023-10-18T00:00:00.000Z')
    }
  },
  {
    description: 'Application of Cast',
    cost: {
      amount: 480.62, //@ts-ignore
      currency: { _id: 'USD' },
      receipts: [
        //@ts-ignore
        { name: 'Photo.jpg', type: 'image/png', data: 'tests/files/dummy.png' }, //@ts-ignore
        { name: 'Photo2.jpg', type: 'image/png', data: 'tests/files/small-dummy.png' }
      ],
      date: new Date('2023-09-13T00:00:00.000Z')
    }
  }
]

test.serial('POST /healthCareCost/expense', async (t) => {
  t.plan(expenses.length + 0)
  for (const expense of expenses) {
    var req = agent.post('/api/healthCareCost/expense')
    for (const entry of objectToFormFields(expense)) {
      if (entry.field.length > 6 && entry.field.slice(-6) == '[data]') {
        req = req.attach(entry.field, entry.val)
      } else {
        req = req.field(entry.field, entry.val)
      }
    }
    const res = await req.field('healthCareCostId', healthCareCost._id.toString())
    t.is(res.status, 200)
  }
})

test.serial('POST /healthCareCost/underExamination', async (t) => {
  t.plan(4)
  const comment = "A quite long comment but this doesn't matter because mongoose has no limit."
  const res = await agent.post('/api/healthCareCost/underExamination').send({ _id: healthCareCost._id, comment })
  t.is(res.status, 200)
  t.is((res.body.result as HealthCareCost).state, 'underExamination')
  t.is((res.body.result as HealthCareCost).history.length, 1)
  t.like((res.body.result as HealthCareCost).comments[0], { text: comment, toState: 'underExamination' })
})

// EXAMINE

test.serial('POST /examine/healthCareCost/underExaminationByInsurance', async (t) => {
  await loginHealthCareCost(agent)
  t.plan(4)
  const comment = '' // empty string should not create comment
  const res = await agent.post('/api/examine/healthCareCost/underExaminationByInsurance').send({ _id: healthCareCost._id, comment })
  t.is(res.status, 200)
  t.is((res.body.result as HealthCareCost).state, 'underExaminationByInsurance')
  t.is((res.body.result as HealthCareCost).history.length, 2)
  t.is((res.body.result as HealthCareCost).comments.length, 1)
})

// REPORT

test.serial('GET /healthCareCost/report', async (t) => {
  t.timeout(20000) // 20 seconds
  await loginUser(agent)
  const res = await agent.get('/api/healthCareCost/report').query({ id: healthCareCost._id })
  t.is(res.status, 200)
})

test.after.always('DELETE /healthCareCost', async (t) => {
  await loginUser(agent)
  const res = await agent.delete('/api/healthCareCost').query({ id: healthCareCost._id })
  t.is(res.status, 200)
})
