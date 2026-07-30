@{
    Severity     = @('Error', 'Warning')

    ExcludeRules = @(
        'PSAvoidUsingWriteHost'   # fine for interactive scripts / CI logging
    )

    Rules        = @{
        PSPlaceOpenBrace           = @{
            Enable             = $true
            OnSameLine         = $true
            NewLineAfter       = $true
            IgnoreOneLineBlock = $true
        }
        PSPlaceCloseBrace          = @{
            Enable             = $true
            NewLineAfter       = $false
            IgnoreOneLineBlock = $true
            NoEmptyLineBefore  = $false
        }
        PSUseConsistentIndentation = @{
            Enable              = $true
            IndentationSize     = 4
            PipelineIndentation = 'IncreaseIndentationForFirstPipeline'
            Kind                = 'space'
        }
        PSUseConsistentWhitespace  = @{
            Enable                                 = $true
            CheckInnerBrace                        = $true
            CheckOpenBrace                         = $true
            CheckOpenParen                         = $true
            CheckOperator                          = $true
            CheckPipe                               = $true
            CheckSeparator                         = $true
        }
        PSAlignAssignmentStatement = @{
            Enable         = $true
            CheckHashtable = $true
        }
        PSUseCorrectCasing         = @{
            Enable = $true
        }
    }
}
