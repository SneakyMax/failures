var format = require('chalk')
var Rx = require('rx')
var R = require('ramda')
var diffChars = require('diff').diffChars
var figures = require('figures')

var indent = R.pipe(pad, pad)
var errorIndent = R.pipe(indent, pad)
var addExtraIndent = R.pipe(R.defaultTo(0), R.repeat(' '), R.join(''))
var formatDiff = R.pipe(
  diffChars,
  R.map(function (part) {

    var color = part.added ? 'bgGreen' : part.removed ? 'bgRed' : 'white'
    return format[color](part.value)
  }),
  R.join('')
)

var exports = module.exports = function (input$) {

  var output$ = new Rx.Subject()

  // Failure Title
  input$.failingAssertions$
    .count()
    .forEach(function (failureCount) {

      if (failureCount < 1) {
        return output$.onCompleted()
      }

      var past = failureCount === 1 ? 'was' : 'were'
      var plural = failureCount === 1 ? 'failure' : 'failures'
      var title = [
        format.red.bold('Failed Tests:'),
        'There ' + past + ' ' + format.red.bold(failureCount) + ' ' + plural,
      ].join(' ')

      output$.onNext(pad(title))
      output$.onNext('')
    })

  // Output failures
  Rx.Observable
    .merge(
      input$.tests$,
      input$.failingAssertions$
    )
    .scan(function (accum, item) {
      if (item.type === 'test' || (item.type === 'assertion' && !accum[item.testNumber])) {
        accum[item.testNumber] = {
          test: item,
          assertions: []
        }
      }
      
      if(item.type === 'assertion') {
        accum[item.testNumber].assertions.push(item)
      }

      return accum
    }, {})
    .takeLast(1)
    .forEach(function (group) {

      Object.keys(group)
        .filter(function (number) {return group[number].assertions.length > 0})
        .map(function (number) {return group[number]})
        .forEach(function (set) {

          output$.onNext(pad(pad(set.test.title)))
          set.assertions
            .forEach(function (assertion) {

              var line = pad(pad(pad([
                format.red(figures.cross + ' ' + assertion.title),
                '\n',
                pad(''),
                '\n'
              ].join(' '))))

              output$.onNext(formatAssertionError(assertion, 2))
            })

          output$.onNext('')
        })

      output$.onCompleted()
    })

  return output$
}

exports.formatAssertionError = formatAssertionError

function formatAssertionError (line, extraIndent) {
  if (line.diagnostic.expected && line.diagnostic.actual) {
    return formatAssertionErrorUnitTesting(line, extraIndent);
  }

  if (line.diagnostic.message && line.diagnostic.severity && line.diagnostic.file) {
    return formatAssertionErrorLinting(line, extraIndent);
  }

  return '';
}

function formatAssertionErrorUnitTesting (line, extraIndent) {
  var diffs = formatDiff(String(line.diagnostic.expected), String(line.diagnostic.actual))
  var output = []

  output.push(indent(format.red.bold(figures.cross + ' ' + line.title)))
  output.push(indent(format.dim('  at ') + format.dim(line.diagnostic.at)))
  output.push('')
  output.push(errorIndent(format.bgGreen('actual') + ' ' + format.bgRed('expected')))
  output.push('')
  output.push(errorIndent(diffs))
  output.push('')

  return output
    .map(function (input) {return addExtraIndent(extraIndent) + input})
    .join('\n')
}

function formatAssertionErrorLinting (line, extraIndent) {
  var output = [];

  output.push(indent(format.red.bold(figures.cross + ' ' + line.diagnostic.message) + format.red('  (' + line.diagnostic.name + ')')))
  output.push(indent(format.dim('  in ') + format.dim(line.diagnostic.file)))
  output.push(indent(format.dim('  on line ') + format.bold(line.diagnostic.line)))
  output.push('');

  return output
    .map(function (input) {return addExtraIndent(extraIndent) + input})
    .join('\n')
}

function pad (str) {

  str = str || ''
  return '  ' + str
}
