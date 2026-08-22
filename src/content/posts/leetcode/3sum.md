---
title: "[LeetCode] 15. 3Sum"
date: "2019-06-17"
description: "3Sum Link to original Problem on LeetCode Given an array nums of n integers, are there elements a, b, c in nums such that a + b + c = 0? Find all unique triplets in the array which gives the sum of zero. Note: The solution set must not contain duplicate triplets. Example: Given array nums = [-1, 0, 1, 2, -1, -4], A solution set is: [ [-1, 0, 1], [-1, -1, 2] ]"
categories: ["Programming", "Algorithms", "LeetCode"]
tags: ["3Sum", "Two Pointers", "Array", "LeetCode", "Algorithm"]
draft: false
---

### 3Sum

[Link to original Problem on LeetCode](https://leetcode.com/problems/3sum/)

Given an array *nums* of *n* integers, are there elements *a*, *b,* *c* in nums such that *a + b + c = 0*? Find all unique triplets in the array which gives the sum of zero.

**Note:**

The solution set must not contain duplicate triplets.

**Example:**

> Given array nums = \[-1, 0, 1, 2, -1, -4\],

> A solution set is: \[ \[-1, 0, 1\], \[-1, -1, 2\] \]

**Company:** *Facebook*, *Amazon*, *Microsoft*

**Solution:**

```python
class Solution(object):
    def threeSum(self, nums):
    """
    :type nums: List[int]
    :rtype: List[List[int]]
    """
    # Runtime: 540 ms
    # Memory Usage: 15.1 MB       
    # Maintain a list to store the result 
    result = []
    # Sort the array so that the searching is easier
    nums.sort()
    length = len(nums)
        
    # Idea is that we will take a element 
    # and then take the two pointer to the next element and the last element
    # Depending on the sum of the sum the two elements 
    # compare to the element we are currently at,
    # we will either move the start pointer or the end pointer
    for i in range(length - 2):
        # Since we have sorted the list we know that if we encounter
        # any positive element all the element following it will be positive
        # sum of 3 positive element can never be 0, so break from the loop if that happens
        if nums[i] > 0: break
        
        # if current number and previous number is same then continue
        # Since we don't want duplicate triplet
        if i> 0 and nums[i] == nums[i-1]: continue
        
        # Setting two pointers
        start, end = i + 1, length - 1
        
        # Keep doing this untill start and ends points to the same element
        while start < end:
            sum =  nums[start] + nums[end] + nums[i] 
            # If sum of three is greater than 0
            # means we need to decrese the sum
            # so decrease end pointer
            if sum > 0: 
                end -= 1
            # If sum of three is less than 0
            # means we need to increase the sum
            # so increase start pointer
            elif sum < 0:
                start += 1
            # Else we have found a triplet
            else:
                # Add triplet to the result
                result.append([nums[i], nums[start], nums[end]])
                # These two loops are used to take care of the duplicate triplets
                while start < end and nums[start] == nums[start+1]:
                    start += 1
                while start < end and nums[end] == nums[end-1]:
                    end -= 1
                start += 1
                end -= 1
        
    return result
```
